import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { Client, Contract, Settings } from '../db/types';
import { buildContractHtml } from './contractHtml';
import type { PdfLang } from './pdfDict';

let fontCache: string | null = null;

/** The WebView that renders the PDF can't see React Native fonts, so the Urdu font is embedded as base64. */
async function nastaliqBase64(): Promise<string | null> {
  if (fontCache) return fontCache;
  try {
    const asset = Asset.fromModule(
      require('@expo-google-fonts/noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf'),
    );
    await asset.downloadAsync();
    if (!asset.localUri) return null;
    fontCache = await new File(asset.localUri).base64();
    return fontCache;
  } catch {
    return null;
  }
}

export async function renderContractPdf(contract: Contract, client: Client | null, settings: Settings, lang: PdfLang): Promise<string> {
  const fontBase64 = lang === 'ur' ? await nastaliqBase64() : null;
  const html = buildContractHtml(contract, client, settings, { lang, fontBase64 });
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  return uri;
}

export async function shareContractPdf(contract: Contract, client: Client | null, settings: Settings, lang: PdfLang): Promise<void> {
  const uri = await renderContractPdf(contract, client, settings, lang);
  const safe = (client?.companyName || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const target = new File(uri.replace(/[^/]+$/, `${contract.contractNumber || 'contract'}-${safe}.pdf`));
  try {
    if (target.exists) target.delete();
    new File(uri).move(target);
  } catch { /* fall back to the generated name */ }
  const finalUri = target.exists ? target.uri : uri;
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: 'Contract PDF', UTI: 'com.adobe.pdf' });
}

export async function printContract(contract: Contract, client: Client | null, settings: Settings, lang: PdfLang): Promise<void> {
  const fontBase64 = lang === 'ur' ? await nastaliqBase64() : null;
  await Print.printAsync({ html: buildContractHtml(contract, client, settings, { lang, fontBase64 }) });
}
