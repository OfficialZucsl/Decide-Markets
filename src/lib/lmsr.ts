/**
 * Logarithmic Market Scoring Rule (LMSR)
 * 
 * This file contains the mathematical foundation for the Decision Markets. 
 * LMSR is the industry standard algorithm for automated market makers (AMMs) 
 * in prediction/decision markets. It ensures infinite liquidity and mathematically 
 * bounds the maximum possible loss for the market creator.
 */

export const B_PARAMETER = 5000; // Liquidity parameter (higher = slower price changes)

/**
 * Calculates the current market probability of the "YES" outcome.
 * Uses the log-sum-exp trick to prevent numerical overflow with large share numbers.
 */
export function calculateProbability(qYes: number, qNo: number, b: number = B_PARAMETER): number {
  const maxQ = Math.max(qYes, qNo);
  const expYes = Math.exp((qYes - maxQ) / b);
  const expNo = Math.exp((qNo - maxQ) / b);
  return expYes / (expYes + expNo);
}

/**
 * Calculates the new share quantities in the market after a user invests a specific
 * amount of points into one side of the market.
 */
export function calculateNewShares(
  qYes: number, 
  qNo: number, 
  investment: number, 
  isYesPosition: boolean, 
  b: number = B_PARAMETER
): { newQYes: number, newQNo: number, sharesBought: number } {
  
  const maxQ = Math.max(qYes, qNo);
  const expYes = Math.exp((qYes - maxQ) / b);
  const expNo = Math.exp((qNo - maxQ) / b);
  const S = expYes + expNo;
  
  const expInvest = Math.exp(investment / b);

  if (isYesPosition) {
    // New Yes Shares = b * ln( e^(investment/b) * S - expNo ) + maxQ
    const inner = expInvest * S - expNo;
    const newQYes = b * Math.log(inner) + maxQ;
    const sharesBought = newQYes - qYes;
    
    return { newQYes, newQNo: qNo, sharesBought };
  } else {
    // New No Shares = b * ln( e^(investment/b) * S - expYes ) + maxQ
    const inner = expInvest * S - expYes;
    const newQNo = b * Math.log(inner) + maxQ;
    const sharesBought = newQNo - qNo;
    
    return { newQYes: qYes, newQNo, sharesBought };
  }
}
