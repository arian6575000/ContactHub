// Labels printed on the contract PDF. The contract's own text (scope, terms…) is printed exactly as typed.
export type PdfLang = 'en' | 'ur';

const EN = {
  title: 'SOFTWARE AGREEMENT', contractNo: 'Contract No', date: 'Date',
  parties: 'Parties to this Agreement', provider: 'SERVICE PROVIDER', client: 'CLIENT',
  scope: 'Scope of Work', commercial: 'Commercial Terms', totalValue: 'Total Contract Value',
  paymentType: 'Payment Type', fullPayment: 'Full Payment', installments: 'Installments',
  startDate: 'Start Date', deliveryDate: 'Delivery Date', support: 'Support / Warranty Period', months: 'month(s)',
  schedule: 'Payment Schedule', installment: 'Installment', dueDate: 'Due Date', amount: 'Amount', total: 'Total',
  terms: 'Terms & Conditions', acceptance: 'Acceptance',
  acceptanceText: 'By signing below, both parties acknowledge that they have read, understood and agree to be bound by the terms of this Agreement.',
  signature: 'Signature', dateLine: 'Date', forParty: 'For',
};

const UR: typeof EN = {
  title: 'سافٹ ویئر معاہدہ', contractNo: 'معاہدہ نمبر', date: 'تاریخ',
  parties: 'معاہدے کے فریقین', provider: 'خدمات فراہم کنندہ', client: 'کلائنٹ',
  scope: 'کام کا دائرہ کار', commercial: 'مالی شرائط', totalValue: 'کل معاہدہ رقم',
  paymentType: 'ادائیگی کی قسم', fullPayment: 'مکمل ادائیگی', installments: 'اقساط',
  startDate: 'آغاز کی تاریخ', deliveryDate: 'حوالگی کی تاریخ', support: 'سپورٹ / وارنٹی کی مدت', months: 'ماہ',
  schedule: 'ادائیگی کا شیڈول', installment: 'قسط', dueDate: 'آخری تاریخ', amount: 'رقم', total: 'کل',
  terms: 'شرائط و ضوابط', acceptance: 'منظوری',
  acceptanceText: 'ذیل میں دستخط کر کے دونوں فریق تصدیق کرتے ہیں کہ انہوں نے اس معاہدے کی شرائط پڑھ اور سمجھ لی ہیں اور ان کی پابندی پر متفق ہیں۔',
  signature: 'دستخط', dateLine: 'تاریخ', forParty: 'منجانب',
};

export type PdfLabels = typeof EN;
export const pdfLabels = (lang: PdfLang): PdfLabels => (lang === 'ur' ? UR : EN);
