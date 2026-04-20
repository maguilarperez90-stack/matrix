import Fraction from 'fraction.js';
import { LPProblem, SimplexSolution, SimplexStep, Validation, Constraint } from '../types';

export class SimplexSolver {
  /**
   * Solves a Linear Programming problem using the Simplex Method with fractional precision.
   */
  solve(problem: LPProblem, isDual = false): SimplexSolution {
    const numOriginalVars = problem.objectiveCoefficients.length;
    const numConstraints = problem.constraints.length;
    
    let table: Fraction[][] = [];
    let basis: string[] = [];
    let headers: string[] = [];
    
    // 1. Setup Headers: [x1, x2, ..., s1, s2, ..., a1, a2, ..., RHS]
    for (let i = 0; i < numOriginalVars; i++) {
        headers.push(problem.variableNames[i] || `x${i + 1}`);
    }
    
    // For this implementation, we use Big M for constraints other than <=
    const M = new Fraction(1000000); // Big M constant
    let hasBigM = false;
    
    for (let i = 0; i < numConstraints; i++) {
      headers.push(`s${i + 1}`); // Slack or Surplus
      if (problem.constraints[i].operator !== '<=') {
        headers.push(`a${i + 1}`); // Artificial
        hasBigM = true;
      }
    }
    headers.push('RHS');
    
    // Initial Objective Row
    let objRow: Fraction[] = new Array(headers.length).fill(new Fraction(0));
    for (let j = 0; j < numOriginalVars; j++) {
      const val = problem.objectiveType === 'MAX' ? -problem.objectiveCoefficients[j] : problem.objectiveCoefficients[j];
      objRow[j] = new Fraction(val);
    }
    
    // 2. Setup Constraint Rows and Basis
    for (let i = 0; i < numConstraints; i++) {
      const constraint = problem.constraints[i];
      let row: Fraction[] = new Array(headers.length).fill(new Fraction(0));
      
      for (let j = 0; j < numOriginalVars; j++) {
        row[j] = new Fraction(constraint.coefficients[j]);
      }
      
      const slackHeader = `s${i + 1}`;
      const artificialHeader = `a${i + 1}`;
      const slackIdx = headers.indexOf(slackHeader);
      const artificialIdx = headers.indexOf(artificialHeader);
      
      if (constraint.operator === '<=') {
        row[slackIdx] = new Fraction(1);
        basis.push(slackHeader);
      } else if (constraint.operator === '>=') {
        row[slackIdx] = new Fraction(-1);
        row[artificialIdx] = new Fraction(1);
        basis.push(artificialHeader);
        // Add M * Artificial to Objective
        const penalty = problem.objectiveType === 'MAX' ? M : M.neg();
        // Since objective is Z - objRow = 0, we subtract M * a from Z
        // Z - ... - M*a = 0 => row 0 coef is -M
        objRow[artificialIdx] = penalty; 
      } else { // '='
        row[artificialIdx] = new Fraction(1);
        basis.push(artificialHeader);
        const penalty = problem.objectiveType === 'MAX' ? M : M.neg();
        objRow[artificialIdx] = penalty;
      }
      
      row[headers.length - 1] = new Fraction(constraint.constant);
      table.push(row);
    }
    
    // Insert objective row at index 0
    table.unshift(objRow);
    
    // 3. Normalize Row 0 if using Big M
    if (hasBigM) {
      for (let i = 1; i < table.length; i++) {
        const basisVar = basis[i - 1];
        if (basisVar.startsWith('a')) {
          const artificialIdx = headers.indexOf(basisVar);
          const factor = table[0][artificialIdx];
          if (factor.compare(0) !== 0) {
            for (let j = 0; j < headers.length; j++) {
              table[0][j] = table[0][j].sub(factor.mul(table[i][j]));
            }
          }
        }
      }
    }
    
    const steps: SimplexStep[] = [];
    steps.push(this.createStep(table, basis, headers, null, null, "Tabla inicial con variables de holgura/artificiales.", false));
    
    let iterations = 0;
    const MAX_ITERATIONS = 200;
    let status: SimplexSolution['status'] = 'OPTIMAL';
    
    while (iterations < MAX_ITERATIONS) {
      // Pivot Selection
      let pivotCol = -1;
      let minVal = new Fraction(0);
      
      for (let j = 0; j < headers.length - 1; j++) {
        if (table[0][j].compare(minVal) < 0) {
          minVal = table[0][j];
          pivotCol = j;
        }
      }
      
      if (pivotCol === -1) {
        // Potential multiple solutions check
        let hasMultiple = false;
        for(let j = 0; j < numOriginalVars; j++) {
           if(table[0][j].compare(0) === 0 && !basis.includes(headers[j])) {
               hasMultiple = true;
           }
        }
        if(hasMultiple) status = 'INFINITE_SOLUTIONS';
        break;
      }
      
      let pivotRow = -1;
      let minRatio: Fraction | null = null;
      let isDegenerate = false;
      
      for (let i = 1; i < table.length; i++) {
        const coef = table[i][pivotCol];
        if (coef.compare(0) > 0) {
          const ratio = table[i][headers.length - 1].div(coef);
          if (minRatio !== null && ratio.compare(minRatio) === 0) {
              isDegenerate = true;
          }
          if (minRatio === null || ratio.compare(minRatio) < 0) {
            minRatio = ratio;
            pivotRow = i;
          }
        }
      }
      
      if (pivotRow === -1) {
        status = 'UNBOUNDED';
        steps.push(this.createStep(table, basis, headers, null, pivotCol, "Problema no acotado detectado.", false, true));
        break;
      }
      
      if(isDegenerate) status = 'DEGENERATE';

      // Update Step description and pivot info for PREVIOUS step
      steps[steps.length - 1].pivotCol = pivotCol;
      steps[steps.length - 1].pivotRow = pivotRow;
      steps[steps.length - 1].description = `Entra ${headers[pivotCol]}, sale ${basis[pivotRow - 1]}.`;
      
      // Pivot
      const pivotVal = table[pivotRow][pivotCol];
      for (let j = 0; j < headers.length; j++) table[pivotRow][j] = table[pivotRow][j].div(pivotVal);
      for (let i = 0; i < table.length; i++) {
        if (i !== pivotRow) {
          const factor = table[i][pivotCol];
          for (let j = 0; j < headers.length; j++) table[i][j] = table[i][j].sub(factor.mul(table[pivotRow][j]));
        }
      }
      
      basis[pivotRow - 1] = headers[pivotCol];
      steps.push(this.createStep(table, basis, headers, null, null, `Iteración ${iterations + 1} completada.`, false));
      iterations++;
    }
    
    // Infeasibility check: if any artificial variables are still in basis with non-zero value
    for (let i = 0; i < basis.length; i++) {
      if (basis[i].startsWith('a') && table[i + 1][headers.length - 1].compare(0) > 0) {
        status = 'INFEASIBLE';
      }
    }
    
    steps[steps.length-1].isOptimal = true;
    steps[steps.length-1].description = status === 'OPTIMAL' ? "Solución óptima alcanzada." : status;

    // Result compilation
    const variables: Record<string, number> = {};
    headers.slice(0, -1).forEach(h => variables[h] = 0);
    basis.forEach((v, i) => variables[v] = table[i + 1][headers.length - 1].valueOf());
    
    let objectiveValue = table[0][headers.length - 1].valueOf();
    if (problem.objectiveType === 'MIN') objectiveValue = -objectiveValue;

    // Dual and Validation
    let dualProblem: LPProblem | undefined;
    let validation: Validation = {
        directSubstitution: 0,
        constraintsSatisfied: true,
        slackValues: {},
        dualObjectiveValue: null,
        isPrecisionValidated: false
    };

    if (status === 'OPTIMAL' || status === 'INFINITE_SOLUTIONS' || status === 'DEGENERATE') {
        if (!isDual) {
            dualProblem = this.convertToDual(problem);
            const dualSolution = this.solve(dualProblem, true);
            validation.dualObjectiveValue = dualSolution.objectiveValue;
        }
        validation = this.validateSolution(problem, variables, validation.dualObjectiveValue);
    }

    return {
      steps,
      variables,
      objectiveValue,
      status,
      validation,
      dualProblem
    };
  }
  
  private convertToDual(primal: LPProblem): LPProblem {
    // Dual coefficients are primal constraints constants
    const dualObjCoefs = primal.constraints.map(c => c.constant);
    const dualObjType = primal.objectiveType === 'MAX' ? 'MIN' : 'MAX';
    
    // Primal: row coefficients (constraints)
    // Dual: column coefficients
    const dualConstraints: Constraint[] = primal.objectiveCoefficients.map((coef, j) => {
        const coefficients = primal.constraints.map(c => c.coefficients[j]);
        return {
            coefficients,
            operator: primal.objectiveType === 'MAX' ? '>=' : '<=',
            constant: coef
        };
    });
    
    return {
        objectiveType: dualObjType,
        objectiveCoefficients: dualObjCoefs,
        constraints: dualConstraints,
        variableNames: primal.constraints.map((_, i) => `y${i + 1}`)
    };
  }

  private validateSolution(problem: LPProblem, variables: Record<string, number>, dualW: number | null): Validation {
    let substitutedZ = 0;
    problem.objectiveCoefficients.forEach((c, i) => {
        substitutedZ += c * (variables[problem.variableNames[i]] || 0);
    });

    let constraintsSatisfied = true;
    const slackValues: Record<string, number> = {};
    
    problem.constraints.forEach((c, i) => {
        let leftSide = 0;
        c.coefficients.forEach((coef, j) => {
            leftSide += coef * (variables[problem.variableNames[j]] || 0);
        });
        
        let slack = 0;
        if (c.operator === '<=') slack = c.constant - leftSide;
        else if (c.operator === '>=') slack = leftSide - c.constant;
        else slack = Math.abs(leftSide - c.constant);

        slackValues[`s${i+1}`] = slack;
        if (slack < -0.0000001) constraintsSatisfied = false;
    });

    const isPrecisionValidated = dualW !== null && Math.abs(substitutedZ - dualW) < 0.000001;

    return {
        directSubstitution: substitutedZ,
        constraintsSatisfied,
        slackValues,
        dualObjectiveValue: dualW,
        isPrecisionValidated
    };
  }

  private createStep(table: Fraction[][], basis: string[], headers: string[], pivotRow: number | null, pivotCol: number | null, description: string, isOptimal: boolean, isUnbounded = false): SimplexStep {
    return {
      tableau: table.map(row => row.map(cell => cell.toFraction())), // Using string format for fractional clarity
      basis: [...basis],
      headers: [...headers],
      pivotRow,
      pivotCol,
      description,
      isOptimal,
      isUnbounded
    };
  }
}
