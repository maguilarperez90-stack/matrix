import { GoogleGenAI, Type } from "@google/genai";
import { LPProblem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeAndExtractLP(text: string): Promise<{ problem: LPProblem, explanation: string }> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            text: `Eres un experto en investigación de operaciones. Analiza el siguiente texto y extrae el modelo de programación lineal completo.
            
            Debes devolver un objeto JSON con:
            1. "problem": El objeto LPProblem con objectiveType, objectiveCoefficients, constraints y variableNames.
            2. "explanation": Un paso a paso detallado de cómo interpretaste el texto para llegar al modelo (identificación de variables, qué representa Z, por qué las restricciones son <=, >= o =).
            
            Usa este esquema JSON:
            {
              "problem": {
                "objectiveType": "MAX" | "MIN",
                "objectiveCoefficients": number[],
                "constraints": [{ "coefficients": number[], "operator": "<=" | ">=" | "=", "constant": number }],
                "variableNames": string[]
              },
              "explanation": string
            }
            
            Si el texto es ambiguo o faltan datos, haz suposiciones lógicas y menciónalo en la explicación.`
          },
          { text: text }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          problem: {
            type: Type.OBJECT,
            properties: {
              objectiveType: { type: Type.STRING, enum: ["MAX", "MIN"] },
              objectiveCoefficients: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              constraints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    coefficients: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    operator: { type: Type.STRING, enum: ["<=", ">=", "="] },
                    constant: { type: Type.NUMBER }
                  },
                  required: ["coefficients", "operator", "constant"]
                }
              },
              variableNames: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["objectiveType", "objectiveCoefficients", "constraints", "variableNames"]
          },
          explanation: { type: Type.STRING }
        },
        required: ["problem", "explanation"]
      }
    }
  });

  if (!response.text) throw new Error("No se pudo analizar el texto.");
  return JSON.parse(response.text);
}

export async function askSimplexQuestion(question: string, context: { tableau: string[][], headers: string[], basis: string[], step: number, description: string }): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            text: `Eres un asistente experto en el Método Simplex y Programación Lineal. 
            El usuario está viendo el paso ${context.step} de su resolución.
            
            DATOS DE LA TABLA ACTUAL:
            Headers: ${JSON.stringify(context.headers)}
            Basis: ${JSON.stringify(context.basis)}
            Tableau (Fracciones): ${JSON.stringify(context.tableau)}
            Descripción del paso: ${context.description}
            
            Responde de forma clara, didáctica y profesional a la duda del usuario sobre esta tabla o el proceso en general. Si pregunta por un valor específico, explícale de dónde sale usando los datos proporcionados.`
          },
          { text: `Duda del usuario: ${question}` }
        ]
      }
    ]
  });

  if (!response.text) throw new Error("No se pudo obtener respuesta.");
  return response.text;
}

export async function extractLPProblem(fileData: string, mimeType: string): Promise<LPProblem> {
  const model = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            text: `Eres un experto en investigación de operaciones. Extrae el problema de programación lineal de este archivo y devuélvelo en formato JSON.
            
            El formato debe ser:
            {
              "objectiveType": "MAX" | "MIN",
              "objectiveCoefficients": number[],
              "constraints": [
                {
                  "coefficients": number[],
                  "operator": "<=" | ">=" | "=",
                  "constant": number
                }
              ],
              "variableNames": string[]
            }
            
            Asegúrate de que todos los vectores de coeficientes tengan la misma longitud que "variableNames".
            Si faltan nombres de variables, usa ["x1", "x2", ...].`
          },
          {
            inlineData: {
              data: fileData,
              mimeType: mimeType
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          objectiveType: { type: Type.STRING, enum: ["MAX", "MIN"] },
          objectiveCoefficients: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          constraints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                coefficients: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                operator: { type: Type.STRING, enum: ["<=", ">=", "="] },
                constant: { type: Type.NUMBER }
              },
              required: ["coefficients", "operator", "constant"]
            }
          },
          variableNames: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["objectiveType", "objectiveCoefficients", "constraints", "variableNames"]
      }
    }
  });

  if (!response.text) {
    throw new Error("No se pudo extraer el problema del archivo.");
  }

  return JSON.parse(response.text) as LPProblem;
}
