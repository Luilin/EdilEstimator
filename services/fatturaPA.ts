import { CostItem, InvoiceSettings, Project, SAL, WBSNode } from '../types';

const xmlEscape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

const vatCountryCode = (vatNumber: string) => {
  const cleaned = String(vatNumber || '').replace(/\s+/g, '').toUpperCase();
  if (cleaned.startsWith('IT')) return { country: 'IT', code: cleaned.slice(2) };
  return { country: 'IT', code: cleaned };
};

const collectItems = (node: WBSNode): CostItem[] => {
  const items = [...node.items];
  node.children.forEach(child => items.push(...collectItems(child)));
  return items;
};

const validate = (settings: InvoiceSettings) => {
  const required: [keyof InvoiceSettings, string][] = [
    ['companyName', 'Ragione sociale cedente'],
    ['vatNumber', 'P.IVA cedente'],
    ['address', 'Indirizzo cedente'],
    ['postalCode', 'CAP cedente'],
    ['city', 'Comune cedente'],
    ['province', 'Provincia cedente'],
    ['invoiceNumber', 'Numero fattura'],
    ['invoiceDate', 'Data fattura'],
    ['clientName', 'Ragione sociale committente'],
    ['clientVatNumber', 'P.IVA committente'],
    ['clientAddress', 'Indirizzo committente'],
    ['clientPostalCode', 'CAP committente'],
    ['clientCity', 'Comune committente'],
    ['clientProvince', 'Provincia committente'],
  ];
  const missing = required.filter(([key]) => !String(settings[key] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`Compila i dati obbligatori: ${missing.map(([, label]) => label).join(', ')}.`);
  }
};

export function buildFatturaPA(project: Project, salId: string, settings: InvoiceSettings): string {
  validate(settings);

  const sal = (project.sals || []).find(item => item.id === salId);
  if (!sal) throw new Error('Seleziona un SAL da fatturare.');

  const items = collectItems(project.rootWBS);
  const byId = new Map(items.map(item => [item.id, item]));
  const lines = sal.rows
    .map(row => {
      const item = byId.get(row.costItemId);
      if (!item || row.qty <= 0) return null;
      return {
        item,
        qty: row.qty,
        unitPrice: item.price,
        total: row.qty * item.price,
      };
    })
    .filter((line): line is { item: CostItem; qty: number; unitPrice: number; total: number } => line !== null);

  if (lines.length === 0) {
    throw new Error('Il SAL selezionato non contiene quantità da fatturare.');
  }

  const linesTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const cassaImporto = linesTotal * (settings.cassaPercent || 0) / 100;
  const imponibile = linesTotal + cassaImporto;
  const iva = imponibile * (settings.vatPercent || 0) / 100;
  const bolloImporto = settings.bollo ? 2 : 0;
  const ritenuta = imponibile * (settings.ritenutaPercent || 0) / 100;
  const totaleDocumento = imponibile + iva + bolloImporto;

  const cedente = vatCountryCode(settings.vatNumber);
  const cessionario = vatCountryCode(settings.clientVatNumber);
  const progressivo = settings.invoiceNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '1';
  const dataFattura = settings.invoiceDate;
  const codiceDestinatario = (settings.clientCodeDestinatario || '0000000').trim().toUpperCase();

  const lineeXml = lines.map((line, index) => `
        <DettaglioLinee>
          <NumeroLinea>${index + 1}</NumeroLinea>
          <Descrizione>${xmlEscape(`${line.item.code} — ${line.item.description}`)}</Descrizione>
          <Quantita>${line.qty.toFixed(4)}</Quantita>
          <UnitaMisura>${xmlEscape(line.item.uom)}</UnitaMisura>
          <PrezzoUnitario>${money(line.unitPrice)}</PrezzoUnitario>
          <PrezzoTotale>${money(line.total)}</PrezzoTotale>
          <AliquotaIVA>${money(settings.vatPercent)}</AliquotaIVA>
        </DettaglioLinee>`).join('');

  const cassaXml = cassaImporto > 0 ? `
      <DatiCassaPrevidenziale>
        <TipoCassa>INPS</TipoCassa>
        <AlCassa>${money(settings.cassaPercent)}</AlCassa>
        <ImportoContributoCassa>${money(cassaImporto)}</ImportoContributoCassa>
        <ImponibileCassa>${money(linesTotal)}</ImponibileCassa>
        <AliquotaIVA>${money(settings.vatPercent)}</AliquotaIVA>
      </DatiCassaPrevidenziale>` : '';

  const ritenutaXml = ritenuta > 0 ? `
      <DatiRitenuta>
        <TipoRitenuta>RT01</TipoRitenuta>
        <ImportoRitenuta>${money(ritenuta)}</ImportoRitenuta>
        <AliquotaRitenuta>${money(settings.ritenutaPercent)}</AliquotaRitenuta>
        <CausalePagamento>A</CausalePagamento>
      </DatiRitenuta>` : '';

  const bolloXml = settings.bollo ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>${money(bolloImporto)}</ImportoBollo>
      </DatiBollo>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(cedente.code.padStart(11, '0').slice(-11))}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${xmlEscape(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${xmlEscape(codiceDestinatario)}</CodiceDestinatario>
      ${settings.clientPec ? `<PECDestinatario>${xmlEscape(settings.clientPec)}</PECDestinatario>` : ''}
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${xmlEscape(cedente.country)}</IdPaese>
          <IdCodice>${xmlEscape(cedente.code)}</IdCodice>
        </IdFiscaleIVA>
        ${settings.taxCode ? `<CodiceFiscale>${xmlEscape(settings.taxCode)}</CodiceFiscale>` : ''}
        <Anagrafica>
          <Denominazione>${xmlEscape(settings.companyName)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${xmlEscape(settings.regimeFiscale || 'RF01')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xmlEscape(settings.address)}</Indirizzo>
        <CAP>${xmlEscape(settings.postalCode)}</CAP>
        <Comune>${xmlEscape(settings.city)}</Comune>
        <Provincia>${xmlEscape(settings.province.toUpperCase().slice(0, 2))}</Provincia>
        <Nazione>${xmlEscape(settings.country || 'IT')}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${xmlEscape(cessionario.country)}</IdPaese>
          <IdCodice>${xmlEscape(cessionario.code)}</IdCodice>
        </IdFiscaleIVA>
        ${settings.clientTaxCode ? `<CodiceFiscale>${xmlEscape(settings.clientTaxCode)}</CodiceFiscale>` : ''}
        <Anagrafica>
          <Denominazione>${xmlEscape(settings.clientName)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xmlEscape(settings.clientAddress)}</Indirizzo>
        <CAP>${xmlEscape(settings.clientPostalCode)}</CAP>
        <Comune>${xmlEscape(settings.clientCity)}</Comune>
        <Provincia>${xmlEscape(settings.clientProvince.toUpperCase().slice(0, 2))}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${xmlEscape(settings.invoiceType || 'TD01')}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${xmlEscape(dataFattura)}</Data>
        <Numero>${xmlEscape(settings.invoiceNumber)}</Numero>
        ${ritenutaXml}${bolloXml}${cassaXml}
        <ImportoTotaleDocumento>${money(totaleDocumento)}</ImportoTotaleDocumento>
        <Causale>${xmlEscape(`SAL ${sal.code} — ${sal.name} — ${project.name}`)}</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${lineeXml}
      <DatiRiepilogo>
        <AliquotaIVA>${money(settings.vatPercent)}</AliquotaIVA>
        <ImponibileImporto>${money(imponibile)}</ImponibileImporto>
        <Imposta>${money(iva)}</Imposta>
        <EsigibilitaIVA>${settings.splitPayment ? 'S' : 'I'}</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamenti>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>${xmlEscape(dataFattura)}</DataScadenzaPagamento>
        <ImportoPagamento>${money(totaleDocumento)}</ImportoPagamento>
        ${settings.iban ? `<IBAN>${xmlEscape(settings.iban)}</IBAN>` : ''}
      </DettaglioPagamento>
    </DatiPagamenti>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}

export function downloadFatturaPA(project: Project, sal: SAL, settings: InvoiceSettings): void {
  const xml = buildFatturaPA(project, sal.id, settings);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const progressive = settings.invoiceNumber.replace(/[^A-Za-z0-9]/g, '') || 'fattura';
  link.href = url;
  link.download = `IT${settings.vatNumber.replace(/\D/g, '').slice(-11)}_${progressive}.xml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
