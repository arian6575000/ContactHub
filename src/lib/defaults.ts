import type { Settings } from '../db/types';

export const DEFAULT_TERMS = `1. SCOPE OF WORK
The Service Provider shall design, develop and deliver the software described in this Agreement ("the Software") in accordance with the specifications, timelines and deliverables agreed with the Client.

2. PAYMENT TERMS
The Client agrees to pay the total contract amount according to the payment schedule set out in this Agreement. Delayed payments may result in suspension of development, delivery or support until dues are cleared.

3. DELIVERY & TIMELINE
The Service Provider will make reasonable effort to deliver the Software by the agreed delivery date. Timelines may be extended by mutual written consent where scope changes or Client-side delays occur.

4. REVISIONS
Reasonable revisions within the original agreed scope are included. Any work beyond the original scope will be treated as an additional request and billed separately.

5. SUPPORT & WARRANTY
The Service Provider will provide free bug-fix support for the period stated in this Agreement from the date of delivery. This does not cover new features, third-party service changes, or issues arising from Client-side modifications.

6. OWNERSHIP
Upon full and final payment, ownership of the delivered Software transfers to the Client. The Service Provider retains the right to reuse general components, libraries and know-how that are not exclusive to the Client's business.

7. CONFIDENTIALITY
Both parties agree to keep confidential any non-public business information shared during this engagement and not disclose it to third parties without written consent.

8. TERMINATION
Either party may terminate this Agreement with written notice. The Client shall pay for all work completed up to the termination date.

9. GOVERNING LAW
This Agreement shall be governed by the laws applicable in the Service Provider's jurisdiction. Any dispute shall first be resolved through mutual discussion before other recourse.`;

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'Your Company Name',
  companyTagline: 'Software Solutions',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  companyLogo: null,
  contractPrefix: 'CN',
  currency: 'PKR',
  defaultTerms: DEFAULT_TERMS,
  updatedAt: 0,
};
