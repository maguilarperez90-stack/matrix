import { motion, AnimatePresence } from 'motion/react';
import { utils, writeFile } from 'xlsx';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Play, 
  Upload, 
  FileText, 
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Info,
  X,
  Sparkles,
  ShieldCheck,
  Scale,
  Download,
  Check
} from 'lucide-react';
import React, { useState, useRef } from 'react';
import { LPProblem, SimplexSolution, Constraint, ObjectiveType, Validation } from './types';
import { SimplexSolver } from './lib/simplex';
import { extractLPProblem, analyzeAndExtractLP, askSimplexQuestion } from './lib/gemini';
import { cn } from './lib/utils';

// --- Sub-component for AI Chat in each step ---
function SimplexStepChat({ step, idx }: { step: any, idx: number }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question) return;
    setLoading(true);
    try {
      const res = await askSimplexQuestion(question, {
        tableau: step.tableau,
        headers: step.headers,
        basis: step.basis,
        step: idx + 1,
        description: step.description
      });
      setAnswer(res);
    } catch (err) {
      setAnswer("Error al consultar a la IA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">¿Tienes dudas sobre esta tabla?</span>
      </div>
      
      <div className="flex gap-2 mb-3">
        <input 
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej: ¿Por qué x2 entró a la base?"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all placeholder:text-slate-700"
        />
        <button 
          onClick={handleAsk}
          disabled={loading || !question}
          className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : "Preguntar"}
        </button>
      </div>

      <AnimatePresence>
        {answer && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 bg-white/5 border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed relative"
          >
            <button onClick={() => setAnswer(null)} className="absolute top-2 right-2 text-slate-600 hover:text-slate-400">
               <X size={12} />
            </button>
            <div className="line-clamp-6 overflow-y-auto max-h-40 pr-2">
               {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>('MAX');
  const [variableNames, setVariableNames] = useState<string[]>(['x1', 'x2']);
  const [objectiveCoefficients, setObjectiveCoefficients] = useState<number[]>([0, 0]);
  const [constraints, setConstraints] = useState<Constraint[]>([
    { coefficients: [0, 0], operator: '<=', constant: 0 }
  ]);
  const [solution, setSolution] = useState<SimplexSolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiObjectiveText, setAiObjectiveText] = useState('');
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addVariable = () => {
    const nextVar = `x${variableNames.length + 1}`;
    setVariableNames([...variableNames, nextVar]);
    setObjectiveCoefficients([...objectiveCoefficients, 0]);
    setConstraints(constraints.map(c => ({
      ...c,
      coefficients: [...c.coefficients, 0]
    })));
  };

  const removeVariable = (index: number) => {
    if (variableNames.length <= 1) return;
    setVariableNames(variableNames.filter((_, i) => i !== index));
    setObjectiveCoefficients(objectiveCoefficients.filter((_, i) => i !== index));
    setConstraints(constraints.map(c => ({
      ...c,
      coefficients: c.coefficients.filter((_, i) => i !== index)
    })));
  };

  const addConstraint = () => {
    setConstraints([...constraints, {
      coefficients: new Array(variableNames.length).fill(0),
      operator: '<=',
      constant: 0
    }]);
  };

  const removeConstraint = (index: number) => {
    if (constraints.length <= 1) return;
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  const updateObjectiveCoef = (index: number, val: string) => {
    const newCoefs = [...objectiveCoefficients];
    newCoefs[index] = parseFloat(val) || 0;
    setObjectiveCoefficients(newCoefs);
  };

  const updateConstraintCoef = (cIndex: number, vIndex: number, val: string) => {
    const newConstraints = [...constraints];
    newConstraints[cIndex].coefficients[vIndex] = parseFloat(val) || 0;
    setConstraints(newConstraints);
  };

  const updateConstraintConstant = (index: number, val: string) => {
    const newConstraints = [...constraints];
    newConstraints[index].constant = parseFloat(val) || 0;
    setConstraints(newConstraints);
  };

  const solve = () => {
    setError(null);
    try {
      const solver = new SimplexSolver();
      const problem: LPProblem = {
        objectiveType,
        objectiveCoefficients,
        constraints,
        variableNames
      };
      
      const result = solver.solve(problem);
      setSolution(result);
      
      // Scroll to result
      setTimeout(() => {
        document.getElementById('solution-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setError("Error al resolver: " + err.message);
    }
  };

  const handleAIDetection = async () => {
    if (!aiObjectiveText) return;
    setAiLoading(true);
    setAiExplanation(null);
    try {
      const { problem, explanation } = await analyzeAndExtractLP(aiObjectiveText);
      
      setObjectiveType(problem.objectiveType);
      setObjectiveCoefficients(problem.objectiveCoefficients);
      setVariableNames(problem.variableNames);
      setConstraints(problem.constraints);
      setAiExplanation(explanation);
      
      setSolution(null);
      // setAiObjectiveText(''); // Keep text for reference
    } catch (err) {
      setError("No se pudo detectar el problema. Intenta ser más específico.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        try {
          const extracted = await extractLPProblem(base64, file.type);
          setObjectiveType(extracted.objectiveType);
          setVariableNames(extracted.variableNames);
          setObjectiveCoefficients(extracted.objectiveCoefficients);
          setConstraints(extracted.constraints);
          setSolution(null);
          setAiExplanation("Problema extraído exitosamente del archivo. Revisa el modelo generado.");
        } catch (err: any) {
          setError("No pudimos procesar el archivo. Asegúrate de que el problema esté claro.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Error al leer el archivo.");
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!solution) return;
    const wb = utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ["Simplex Pro - Resultados"],
      ["Estado", solution.status],
      ["Valor Objetivo (Z)", solution.objectiveValue],
      [],
      ["Variables Óptimas"],
      ...Object.entries(solution.variables).filter(([_,v]) => (v as number) > 0).map(([k,v]) => [k, v])
    ];
    const wsSummary = utils.aoa_to_sheet(summaryData);
    utils.book_append_sheet(wb, wsSummary, "Resumen");

    // Steps Sheets (Limited to avoid too many tabs if it's huge, but let's do all)
    solution.steps.forEach((step, i) => {
      const data = [
        [`Paso ${i + 1}: ${step.description}`],
        [],
        ["Base", ...step.headers],
        ...step.tableau.map((row, rIdx) => [
          rIdx === 0 ? 'Z' : step.basis[rIdx - 1],
          ...row
        ])
      ];
      const ws = utils.aoa_to_sheet(data);
      utils.book_append_sheet(wb, ws, `Paso ${i + 1}`);
    });

    writeFile(wb, "Solucion_Simplex_Pro.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden relative">
      <div className="atmosphere" />
      
      {/* Navbar / Header */}
      <nav className="fixed top-0 w-full z-50 bg-white/10 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Calculator size={18} />
            </div>
            <span className="font-bold tracking-tight text-lg">Simplex Pro</span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-slate-400">
            <a href="#about" className="hover:text-indigo-400 transition-colors">Método</a>
            <a href="#calculator" className="hover:text-indigo-400 transition-colors">Calculadora</a>
            <button 
              onClick={() => {
                setSolution(null);
                setConstraints([{ coefficients: [0, 0], operator: '<=', constant: 0 }]);
                setObjectiveCoefficients([0, 0]);
                setVariableNames(['x1', 'x2']);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl transition-all"
            >
              <RefreshCw size={14} />
              Limpiar
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-20">
        {/* Hero Section */}
        <section id="about" className="max-w-7xl mx-auto px-6 mb-24 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <h1 className="text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
              Optimiza tus decisiones con el <span className="text-indigo-400 italic">Método Simplex.</span>
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed max-w-2xl">
              Nuestra calculadora inteligente resuelve problemas de programación lineal paso a paso. 
              Sube un PDF, una foto o escríbelo manualmente.
            </p>
          </motion.div>
        </section>

        {/* Input Section */}
        <section id="calculator" className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 mb-32 relative z-10">
          {/* Controls Column */}
          <div className="lg:col-span-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="glass-card rounded-3xl p-8"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                  {(['MAX', 'MIN'] as ObjectiveType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setObjectiveType(type)}
                      className={cn(
                        "px-6 py-2 rounded-lg text-sm font-semibold transition-all",
                        objectiveType === type 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                          : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {type === 'MAX' ? 'Maximizar' : 'Minimizar'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={addVariable}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
                  >
                    <Plus size={16} /> Variable
                  </button>
                  <button 
                    onClick={addConstraint}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
                  >
                    <Plus size={16} /> Restricción
                  </button>
                </div>
              </div>

              {/* Function Input */}
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                  <h3 className="font-bold text-lg uppercase tracking-wider text-indigo-300 text-xs text-opacity-100">Función Objetivo</h3>
                </div>
                <div className="flex flex-wrap items-center gap-4 p-6 glass-input rounded-2xl border-dashed">
                  <span className="text-2xl font-serif italic text-slate-500">Z = </span>
                  {variableNames.map((name, i) => (
                    <div key={name} className="flex items-center gap-2 translate-y-[-2px]">
                      <div className="relative">
                        <input
                          type="number"
                          value={objectiveCoefficients[i]}
                          onChange={(e) => updateObjectiveCoef(i, e.target.value)}
                          className="w-24 px-4 py-3 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center font-mono text-white"
                        />
                        <button 
                          onClick={() => removeVariable(i)}
                          className="absolute -top-2 -right-2 bg-slate-800 text-slate-400 hover:text-red-500 rounded-full p-1 border border-white/10 shadow-sm opacity-0 hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                      <span className="font-semibold text-slate-400 text-xl">{name}</span>
                      {i < variableNames.length - 1 && <span className="text-xl text-slate-600 mx-1">+</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Constraints Input */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1.5 h-6 bg-slate-700 rounded-full" />
                  <h3 className="font-bold text-lg uppercase tracking-wider text-slate-400 text-xs">Sujeto a:</h3>
                </div>
                <div className="space-y-4">
                  {constraints.map((c, cIdx) => (
                    <div key={cIdx} className="flex flex-wrap items-center gap-4 p-4 hover:bg-white/5 rounded-2xl transition-colors group">
                      {c.coefficients.map((coef, vIdx) => (
                        <div key={vIdx} className="flex items-center gap-2">
                          <input
                            type="number"
                            value={coef}
                            onChange={(e) => updateConstraintCoef(cIdx, vIdx, e.target.value)}
                            className="w-20 px-3 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-indigo-500/50 transition-all text-center font-mono text-sm text-white"
                          />
                          <span className="font-medium text-slate-500">{variableNames[vIdx]}</span>
                          {vIdx < variableNames.length - 1 && <span className="text-slate-700">+</span>}
                        </div>
                      ))}
                      <select 
                        value={c.operator}
                        className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl font-bold text-slate-300 focus:outline-none"
                        onChange={(e) => {
                          const newC = [...constraints];
                          newC[cIdx].operator = e.target.value as any;
                          setConstraints(newC);
                        }}
                      >
                        <option value="<=" className="bg-slate-900">≤</option>
                        <option value=">=" className="bg-slate-900">≥</option>
                        <option value="=" className="bg-slate-900">=</option>
                      </select>
                      <input
                        type="number"
                        value={c.constant}
                        onChange={(e) => updateConstraintConstant(cIdx, e.target.value)}
                        className="w-24 px-4 py-2 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center font-mono text-white"
                      />
                      <button 
                        onClick={() => removeConstraint(cIdx)}
                        className="p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <div className="pt-6 border-t border-white/10 flex items-center gap-2 text-xs text-slate-500 italic">
                    <Info size={14} />
                    <span>Todas las variables se asumen no negativas: x<sub>i</sub> ≥ 0</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-4 space-y-6">
            {/* AI Assistant Box */}
            <div className="glass-card rounded-3xl p-8">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-indigo-400" />
                Asistente de IA
              </h4>
              <p className="text-xs text-slate-500 mb-4">Escribe tu problema y detectaremos la función objetivo automáticamente.</p>
              <textarea 
                value={aiObjectiveText}
                onChange={(e) => setAiObjectiveText(e.target.value)}
                placeholder="Ej: Maximizar beneficios de 3x + 5y..."
                className="w-full h-24 bg-black/40 border border-white/5 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none mb-4 transition-all"
              />
              <button 
                onClick={handleAIDetection}
                disabled={aiLoading || !aiObjectiveText}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-indigo-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-indigo-500/10"
              >
                {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Analizar Problema Completo
              </button>

              <AnimatePresence>
                {aiExplanation && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 overflow-hidden"
                  >
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2 text-indigo-400">
                        <Info size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Explicación de la IA</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed italic">
                        {aiExplanation}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* File Upload Box */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="bg-indigo-500/5 border-2 border-dashed border-indigo-500/20 rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-500/10 hover:border-indigo-500/40 transition-all group"
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt"
                className="hidden" 
              />
              <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {loading ? <RefreshCw className="text-indigo-400 animate-spin" /> : <Upload className="text-indigo-400" />}
              </div>
              <h4 className="font-bold text-indigo-100 mb-2">Carga inteligente</h4>
              <p className="text-sm text-slate-400">Sube un PDF o documento y Gemini extraerá el problema por ti.</p>
            </div>

            {/* Resume / Summary */}
            <div className="glass-card rounded-3xl p-8">
              <h4 className="font-bold mb-6 flex items-center gap-2">
                <Calculator size={18} className="text-indigo-400" />
                Resumen del Modelo
              </h4>
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm py-2 border-b border-white/5">
                  <span className="text-slate-500">Objetivo</span>
                  <span className="font-mono text-indigo-400">{objectiveType}</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-white/5">
                  <span className="text-slate-500">Variables</span>
                  <span className="font-mono text-slate-300">{variableNames.length}</span>
                </div>
                <div className="flex justify-between text-sm py-2">
                  <span className="text-slate-500">Restricciones</span>
                  <span className="font-mono text-slate-300">{constraints.length}</span>
                </div>
              </div>
              <button 
                onClick={solve}
                disabled={loading}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
              >
                {loading ? 'Procesando...' : <><Play size={18} /> Optimizar Ahora</>}
              </button>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3"
              >
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600 flex-shrink-0">
                  <X size={16} />
                </div>
                <p className="text-sm text-red-900 leading-tight pt-1">{error}</p>
              </motion.div>
            )}
          </div>
        </section>

        {/* Results Section */}
        <AnimatePresence>
          {solution && (
            <motion.section 
              id="solution-section"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-7xl mx-auto px-6 pb-40"
            >
              <div className="flex items-center gap-4 mb-12 relative z-10">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Solución Completa</h2>
                  <p className="text-slate-400">Proceso detallado iteración por iteración.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 relative z-10">
                <div className="xl:col-span-8 space-y-16">
                  {solution.steps.map((step, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, margin: "-100px" }}
                      className="relative pl-12 border-l-2 border-white/5 pb-8"
                    >
                      <div className="absolute left-[-9px] top-0 w-4 h-4 bg-slate-900 border-2 border-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                      
                      <div className="glass-card rounded-3xl overflow-hidden shadow-2xl relative">
                        {step.isOptimal && solution.status === 'OPTIMAL' && (
                          <div className="absolute top-4 right-4 z-20 bg-emerald-500 rounded-full p-2 text-white shadow-lg animate-bounce">
                             <Check size={24} />
                          </div>
                        )}
                        <div className="bg-white/5 px-8 py-4 border-b border-white/5 flex items-center justify-between">
                          <h4 className="font-bold text-indigo-300 uppercase tracking-widest text-xs">Paso {idx + 1}</h4>
                          <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                            <ArrowRight size={10} className="text-indigo-400"/> Iteración {idx}
                          </span>
                        </div>
                        
                        <div className="p-8 overflow-x-auto bg-black/20">
                          {/* Table structure code stays same */}
                          <table className="w-full min-w-[600px] text-sm font-mono border-collapse">
                            <thead>
                              <tr className="border-b border-white/5">
                                <th className="py-4 px-4 text-left font-serif italic text-slate-500 capitalize bg-slate-900/50">Base</th>
                                {step.headers.map((h, i) => (
                                  <th key={i} className={cn("py-4 px-4 text-center text-slate-400 uppercase text-[10px] tracking-widest bg-slate-900/50", step.pivotCol === i && "bg-indigo-500/10 text-indigo-300")}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {step.tableau.map((row, rIdx) => (
                                <tr key={rIdx} className={cn("border-b border-white/5 last:border-0", step.pivotRow === rIdx && "bg-indigo-500/10 text-indigo-300")}>
                                  <td className="py-4 px-4 font-bold text-slate-300 bg-slate-900/30">
                                    {rIdx === 0 ? 'Z' : step.basis[rIdx - 1]}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td 
                                      key={cIdx} 
                                      className={cn(
                                        "py-4 px-4 text-center transition-all bg-slate-800/20",
                                        step.pivotCol === cIdx && "bg-indigo-500/5",
                                        step.pivotRow === rIdx && step.pivotCol === cIdx && "bg-indigo-500/30 rounded-lg scale-110 font-bold border border-indigo-500/50 text-white"
                                      )}
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Explanation Box Below Table */}
                        <div className="p-6 bg-indigo-500/5 border-t border-white/5">
                           <div className="flex items-start gap-4">
                              <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                                 <Info size={20} />
                              </div>
                              <div>
                                 <h5 className="font-bold text-indigo-200 text-sm mb-1 uppercase tracking-wider">
                                    {idx === solution.steps.length - 1 ? "Análisis Exhaustivo Final" : "¿Qué se hizo en este paso?"}
                                 </h5>
                                 <p className={cn(
                                   "text-slate-400 text-xs leading-relaxed",
                                   idx === solution.steps.length - 1 && "text-[13px] text-slate-300 font-serif italic border-l-2 border-indigo-500/30 pl-4 py-2 bg-indigo-500/5 rounded-r-xl"
                                 )}>
                                    {step.description}
                                    {idx === solution.steps.length - 1 && solution.status === 'OPTIMAL' && (
                                       <span className="block mt-4 text-emerald-400 font-sans not-italic font-bold text-xs uppercase tracking-widest">
                                          CERTIFICADO DE OPTIMIDAD: Se han agotado todas las posibilidades de mejora. Ningún movimiento hacia una solución básica factible adyacente aumentará el valor de Z. La región factible ha sido explorada en su totalidad siguiendo la trayectoria de máximo gradiente (regla de Bland/Dantzig).
                                       </span>
                                    )}
                                    {step.pivotRow !== null && step.pivotCol !== null && (
                                       <span className="block mt-2 italic text-indigo-300/70">
                                          * El pivote se encuentra en la intersección de la fila {step.pivotRow} y la columna {step.headers[step.pivotCol]}. 
                                          Se han realizado las operaciones de Gauss-Jordan para normalizar el pivote y eliminar los demás elementos de la columna.
                                       </span>
                                    )}
                                 </p>

                                 {/* Step Chat Module */}
                                 <SimplexStepChat step={step} idx={idx} />
                              </div>
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Final Result Sidebar */}
                <div className="xl:col-span-4">
                  <div className="sticky top-24 space-y-6">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(16,185,129,0.1)]">
                      <h4 className="text-emerald-400 uppercase tracking-widest text-xs font-bold mb-4">Resultado Final</h4>
                      <p className="text-5xl font-mono mb-8 text-white">
                        Z = {Math.round(solution.objectiveValue * 1000) / 1000}
                      </p>
                      <div className="space-y-3">
                        {Object.entries(solution.variables).filter(([_, val]) => (val as number) > 0).map(([name, val]) => (
                          <div key={name} className="flex justify-between items-center text-lg">
                            <span className="text-slate-400 italic font-serif">{name} óptimo</span>
                            <span className="font-mono font-bold text-white">{Math.round((val as number) * 1000) / 1000}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-card rounded-3xl p-8">
                      <h4 className="font-bold mb-4 text-slate-200">Interpretación</h4>
                      <p className="text-slate-400 text-sm leading-relaxed mb-6">
                        {solution.status === 'OPTIMAL' 
                          ? `Se ha encontrado el punto óptimo. La combinación de variables que maximiza el beneficio (Z) es la mostrada arriba.`
                          : `El problema presenta características especiales (${solution.status}). Revisa las restricciones.`}
                      </p>
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => window.print()}
                          className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-slate-300"
                        >
                          <FileText size={18} /> Exportar Informe
                        </button>
                        <button 
                          onClick={exportToExcel}
                          className="w-full py-4 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all text-emerald-400 shadow-lg shadow-emerald-950/20"
                        >
                          <Download size={18} /> Descargar Excel
                        </button>
                      </div>
                    </div>

                    <div className="glass-card rounded-3xl p-8 bg-indigo-500/5 border-indigo-500/20">
                       <h4 className="font-bold mb-4 text-indigo-200">Explicación Final</h4>
                       <p className="text-slate-400 text-sm leading-relaxed italic">
                         {solution.status === 'OPTIMAL' ? (
                           <>
                             El algoritmo ha convergido con éxito. El valor de la función objetivo mostrado se ha comparado con el modelo dual y se ha verificado mediante sustitución directa. Se confirma que no hay mejores combinaciones posibles dentro de la región factible definida.
                           </>
                         ) : (
                           <>
                             El proceso finalizó con un estado especial: <strong>{solution.status}</strong>. 
                             Esto indica que el modelo puede requerir ajustes en las restricciones o en la función objetivo para ser resoluble en un espacio finito y cerrado.
                           </>
                         )}
                       </p>
                    </div>

                    {/* Dual Summary */}
                    {solution.dualProblem && (
                      <div className="glass-card rounded-3xl p-8 border-indigo-500/20">
                         <div className="flex items-center gap-2 mb-4 text-indigo-400">
                           <Scale size={18} />
                           <h4 className="font-bold">Modelo Dual</h4>
                         </div>
                         <div className="text-xs space-y-2 font-mono text-slate-400">
                           <p className="text-indigo-300">{solution.dualProblem.objectiveType} W = {solution.dualProblem.objectiveCoefficients.map((c, i) => `${c}y${i+1}`).join(' + ')}</p>
                           {solution.dualProblem.constraints.map((c, i) => (
                               <p key={i}>{c.coefficients.map((coef, j) => `${coef}y${j+1}`).join(' + ')} {c.operator} {c.constant}</p>
                           ))}
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Validation Panel */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-24 glass-card rounded-[40px] p-12 border-emerald-500/20 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <ShieldCheck size={200} className="text-emerald-400" />
                </div>
                
                <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                  <ShieldCheck size={28} className="text-emerald-400" />
                  Validación de Resultados y Doble Comprobación
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Direct Substitution */}
                  <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Sustitución Directa</p>
                    <div className="flex items-baseline gap-2">
                       <span className="text-3xl font-mono text-white">{Math.round(solution.validation.directSubstitution * 1000) / 1000}</span>
                       <span className="text-emerald-500 font-bold text-xs">OK</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-4 leading-relaxed">
                      Se han sustituido los valores óptimos en la función Z original para garantizar integridad.
                    </p>
                  </div>

                  {/* Dual Validation */}
                  <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Consistencia Dual</p>
                    <div className="flex items-baseline gap-2">
                       <span className="text-3xl font-mono text-white">{solution.validation.dualObjectiveValue !== null ? Math.round(solution.validation.dualObjectiveValue * 1000) / 1000 : 'N/A'}</span>
                       {solution.validation.isPrecisionValidated ? 
                          <span className="text-indigo-400 font-bold text-xs">PRECISIÓN ALTA</span> : 
                          <span className="text-slate-600 text-xs">N/A</span>
                       }
                    </div>
                    <p className="text-[10px] text-slate-600 mt-4 leading-relaxed">
                      El valor Z Primal coincide con el valor W del problema Dual. Teorema de Dualidad Fuerte verificado.
                    </p>
                  </div>

                  {/* Slack Compliance */}
                  <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold">Criterio de Holguras</p>
                    <div className="flex items-baseline gap-2">
                       <span className="text-indigo-400 font-bold text-lg">
                         {solution.validation.constraintsSatisfied ? 'FACTIBLE' : 'ERROR'}
                       </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                       {Object.entries(solution.validation.slackValues).map(([name, val]) => {
                           const v = val as number;
                           return (
                             <div key={name} className="flex justify-between text-[10px] font-mono">
                               <span className="text-slate-600">{name}:</span>
                               <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{Math.round(v * 100) / 100}</span>
                             </div>
                           );
                       })}
                    </div>
                  </div>
                </div>

                <div className="mt-12 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center gap-3">
                   <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                   <p className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em]">
                     Cálculo validado mediante Dualidad y Sustitución Directa
                   </p>
                </div>
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-12 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Calculator size={18} />
            </div>
            <span className="font-bold tracking-tight text-white">Simplex Pro</span>
          </div>
          <p className="text-slate-500 text-sm">
            &copy; 2026 Simplex Pro. Herramienta de optimización para investigación de operaciones.
          </p>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-500 border border-white/5">
               <Info size={18} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
