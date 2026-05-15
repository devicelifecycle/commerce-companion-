const STORAGE_KEY = 'transfer-pricing-rules';

interface PricingRule {
  id: string;
  fromCompanyId: string;
  toCompanyId: string;
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  category: string;
  isActive: boolean;
}

export function getTransferPriceFromRules(
  costPrice: number,
  fromCompanyId: string,
  toCompanyId: string,
  category: string = 'all'
): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return costPrice;
    const rules: PricingRule[] = JSON.parse(stored);
    const rule = rules.find(r =>
      r.isActive &&
      r.fromCompanyId === fromCompanyId &&
      r.toCompanyId === toCompanyId &&
      (r.category === 'all' || r.category === category)
    );
    if (!rule) return costPrice;
    if (rule.markupType === 'percentage') {
      return Math.round(costPrice * (1 + rule.markupValue / 100) * 100) / 100;
    }
    return costPrice + rule.markupValue;
  } catch {
    return costPrice;
  }
}
