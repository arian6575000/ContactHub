// Contract → print-ready A4 HTML (rendered to PDF by expo-print). Port of the web app's jsPDF layout.
// HTML is used instead of drawing primitives so Urdu (RTL, Nastaliq) text shapes correctly.
import type { Client, Contract, Settings } from '../db/types';
import { Fmt } from './format';
import { pdfLabels, type PdfLang } from './pdfDict';

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface ContractHtmlOpts { lang: PdfLang; fontBase64?: string | null }

export function buildContractHtml(contract: Contract, client: Client | null, settings: Settings, o: ContractHtmlOpts): string {
  const L = pdfLabels(o.lang);
  const rtl = o.lang === 'ur';
  const money = (n: number) => Fmt.money(n, contract.currency);
  const terms = (contract.termsAndConditions ?? settings.defaultTerms ?? '').trim();
  const termBlocks = terms.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const total = contract.schedule.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const partyLines = (lines: (string | undefined)[]) =>
    lines.filter(Boolean).map((l) => `<div class="pl">${esc(l)}</div>`).join('');

  const font = o.fontBase64
    ? `@font-face{font-family:'NastaliqEmbedded';src:url(data:font/ttf;base64,${o.fontBase64}) format('truetype');}`
    : '';
  const family = rtl ? `'NastaliqEmbedded','Noto Nastaliq Urdu',serif` : `-apple-system,Roboto,'Helvetica Neue',Arial,sans-serif`;

  return `<!doctype html><html lang="${o.lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${font}
@page{size:A4;margin:16mm 14mm 18mm}
*{box-sizing:border-box}
body{margin:0;font-family:${family};color:#14161F;font-size:12px;line-height:${rtl ? 2.1 : 1.55}}
.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid #E1E4EE;padding-bottom:14px;margin-bottom:18px}
.brand{display:flex;gap:12px;align-items:flex-start}
.logo{width:56px;height:56px;object-fit:contain}
.co{font-size:18px;font-weight:700}
.muted{color:#8C91A0;font-size:11px}
.title{text-align:${rtl ? 'left' : 'right'}}
.title h1{margin:0;font-size:19px;color:#3E6BFF;letter-spacing:.3px}
.title div{font-size:11.5px;color:#5A5F6E}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.6px;margin:20px 0 10px;padding-bottom:4px;position:relative;break-after:avoid}
h2:after{content:'';position:absolute;bottom:0;${rtl ? 'right' : 'left'}:0;width:34px;height:2px;background:#3E6BFF}
.parties{display:flex;gap:14px}
.party{flex:1;background:#F6F8FD;border:1px solid #E1E4EE;border-radius:8px;padding:12px 14px;break-inside:avoid}
.party .k{font-size:10px;color:#8C91A0;font-weight:700;letter-spacing:.5px}
.party .n{font-size:14px;font-weight:700;margin:3px 0 4px}
.pl{color:#5A5F6E;font-size:11.5px}
.stitle{font-size:14px;font-weight:700;margin-bottom:6px}
p{margin:0 0 8px;color:#5A5F6E;white-space:pre-wrap}
table{width:100%;border-collapse:collapse}
.kv td{padding:7px 0;border-bottom:1px solid #E1E4EE;vertical-align:top}
.kv td:first-child{font-weight:700;width:38%;color:#14161F}
.kv td:last-child{color:#5A5F6E}
.grid th{background:#3E6BFF;color:#fff;text-align:start;padding:8px 10px;font-size:11px}
.grid td{border:1px solid #E1E4EE;padding:8px 10px;color:#5A5F6E}
.grid .num{text-align:${rtl ? 'left' : 'right'};white-space:nowrap}
.grid tr.tot td{background:#F6F8FD;font-weight:700;color:#14161F}
.grid tr{break-inside:avoid}
.term{break-inside:avoid;font-size:11px;color:#5A5F6E;margin-bottom:9px;white-space:pre-wrap}
.accept{break-inside:avoid;margin-top:8px}
.sigs{display:flex;gap:40px;margin-top:34px}
.sig{flex:1}
.sig .who{font-weight:700;font-size:11.5px;color:#5A5F6E;margin-bottom:34px}
.sig .line{border-top:1px solid #9AA0B2;padding-top:4px;font-size:10.5px;color:#8C91A0}
.sig .line.d{width:55%;margin-top:26px}
</style></head><body>
<div class="header">
  <div class="brand">
    ${settings.companyLogo ? `<img class="logo" src="${esc(settings.companyLogo)}">` : ''}
    <div>
      <div class="co">${esc(settings.companyName || '—')}</div>
      ${settings.companyTagline ? `<div class="muted">${esc(settings.companyTagline)}</div>` : ''}
      <div class="muted">${esc([settings.companyAddress, settings.companyPhone, settings.companyEmail].filter(Boolean).join('  ·  '))}</div>
    </div>
  </div>
  <div class="title">
    <h1>${esc(L.title)}</h1>
    <div>${esc(L.contractNo)}: <b>${esc(contract.contractNumber || '—')}</b></div>
    <div>${esc(L.date)}: ${esc(Fmt.date(contract.createdAt))}</div>
  </div>
</div>

<h2>${esc(L.parties)}</h2>
<div class="parties">
  <div class="party"><div class="k">${esc(L.provider)}</div><div class="n">${esc(settings.companyName || '—')}</div>
    ${partyLines([settings.companyAddress, settings.companyPhone, settings.companyEmail, settings.companyWebsite])}</div>
  <div class="party"><div class="k">${esc(L.client)}</div><div class="n">${esc(client?.companyName || '—')}</div>
    ${partyLines([client?.contactPerson, [client?.address, client?.city].filter(Boolean).join(', '), client?.phone, client?.email])}</div>
</div>

<h2>${esc(L.scope)}</h2>
<div class="stitle">${esc(contract.softwareName || 'Software Development')}</div>
${contract.scopeDescription ? `<p>${esc(contract.scopeDescription)}</p>` : ''}

<h2>${esc(L.commercial)}</h2>
<table class="kv">
  <tr><td>${esc(L.totalValue)}</td><td>${esc(money(contract.amount))}</td></tr>
  <tr><td>${esc(L.paymentType)}</td><td>${esc(contract.paymentType === 'installments' ? L.installments : L.fullPayment)}</td></tr>
  <tr><td>${esc(L.startDate)}</td><td>${esc(Fmt.date(contract.startDate))}</td></tr>
  <tr><td>${esc(L.deliveryDate)}</td><td>${esc(Fmt.date(contract.deliveryDate))}</td></tr>
  <tr><td>${esc(L.support)}</td><td>${contract.supportPeriodMonths || 0} ${esc(L.months)}</td></tr>
</table>

${contract.paymentType === 'installments' && contract.schedule.length ? `
<h2>${esc(L.schedule)}</h2>
<table class="grid">
  <tr><th>${esc(L.installment)}</th><th>${esc(L.dueDate)}</th><th class="num">${esc(L.amount)}</th></tr>
  ${contract.schedule.map((p) => `<tr><td>${esc(p.label || L.installment)}</td><td>${esc(Fmt.date(p.dueDate))}</td><td class="num">${esc(money(p.amount))}</td></tr>`).join('')}
  <tr class="tot"><td>${esc(L.total)}</td><td></td><td class="num">${esc(money(total))}</td></tr>
</table>` : ''}

<h2>${esc(L.terms)}</h2>
${termBlocks.map((b) => `<div class="term">${esc(b)}</div>`).join('')}

<div class="accept">
  <h2>${esc(L.acceptance)}</h2>
  <p>${esc(L.acceptanceText)}</p>
  <div class="sigs">
    <div class="sig"><div class="who">${esc(L.forParty)} ${esc(settings.companyName || '')}</div>
      <div class="line">${esc(L.signature)}</div><div class="line d">${esc(L.dateLine)}</div></div>
    <div class="sig"><div class="who">${esc(L.forParty)} ${esc(client?.companyName || '')}</div>
      <div class="line">${esc(L.signature)}</div><div class="line d">${esc(L.dateLine)}</div></div>
  </div>
</div>
</body></html>`;
}
