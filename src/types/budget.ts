// Budget Types

export interface BudgetCategory {
  id: number;
  name: string;
  icon: string;
  color: string;
  isIncome: boolean;
  sortOrder: number;
}

export interface BudgetItem {
  id: number;
  budgetId: number;
  categoryId: number;
  categoryName?: string;
  icon?: string;
  color?: string;
  isIncome?: boolean;
  description: string;
  vendorName?: string;
  estimatedAmount: number;
  actualAmount?: number;
  isPaid: boolean;
  paidDate?: string;
  paymentMethod?: string;
  receiptUrl?: string;
  notes?: string;
  status: string;
  dueDate?: string;
}
