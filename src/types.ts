export type ObjectiveType = 'MAX' | 'MIN';

export interface Constraint {
  coefficients: number[];
  operator: '<=' | '>=' | '=';
  constant: number;
}

export interface LPProblem {
  objectiveType: ObjectiveType;
  objectiveCoefficients: number[];
  constraints: Constraint[];
  variableNames: string[];
}

export interface SimplexStep {
  tableau: string[][]; // Store as string representation of fractions for display
  basis: string[];
  headers: string[];
  pivotRow: number | null;
  pivotCol: number | null;
  description: string;
  isOptimal: boolean;
  isUnbounded: boolean;
}

export interface Validation {
  directSubstitution: number;
  constraintsSatisfied: boolean;
  slackValues: Record<string, number>;
  dualObjectiveValue: number | null;
  isPrecisionValidated: boolean;
}

export interface SimplexSolution {
  steps: SimplexStep[];
  variables: Record<string, number>;
  objectiveValue: number;
  status: 'OPTIMAL' | 'UNBOUNDED' | 'INFINITE_SOLUTIONS' | 'INFEASIBLE' | 'DEGENERATE';
  validation: Validation;
  dualProblem?: LPProblem;
}
