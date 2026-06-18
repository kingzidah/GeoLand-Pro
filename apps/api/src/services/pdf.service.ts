import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { ApiError } from '../utils/ApiError';
import { brand } from '../config/brand.config';

// ─── Core renderer ────────────────────────────────────────────────────────────

async function htmlToPdf(html: string): Promise<Buffer> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    return Buffer.from(pdf);
  } catch (err) {
    throw ApiError.internal('PDF generation failed — ensure Puppeteer dependencies are installed');
  } finally {
    await browser?.close();
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  .header { background: #1a3c5e; color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18pt; letter-spacing: 1px; }
  .header .doc-type { font-size: 10pt; opacity: 0.85; text-align: right; }
  .section { margin: 16px 0; }
  .section-title { font-size: 10pt; font-weight: bold; color: #1a3c5e; border-bottom: 1.5px solid #1a3c5e; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .field label { font-size: 8pt; color: #666; display: block; }
  .field span { font-size: 10pt; font-weight: 600; }
  .amount { font-size: 14pt; font-weight: bold; color: #1a3c5e; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #f0f4f8; text-align: left; padding: 6px 8px; font-size: 9pt; color: #444; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  .sig-box { border: 1px solid #ccc; padding: 12px 16px; margin-top: 8px; min-height: 70px; }
  .sig-box p { font-size: 9pt; color: #888; margin-top: 8px; }
  .footer { margin-top: 24px; font-size: 8pt; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: bold; }
  .badge-active { background: #d1fae5; color: #065f46; }
  .highlight-box { background: #f0f4f8; border-left: 3px solid #1a3c5e; padding: 10px 14px; margin: 8px 0; }
`;

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${BASE_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface LeaseDocData {
  leaseNumber: string;
  status: string;
  startDate: Date;
  endDate: Date;
  monthlyRentGHS: number;
  depositAmountGHS: number;
  plotCentroidLat: number;
  plotCentroidLng: number;
  notes?: string | null;
  plot: { plotNumber: string; areaSqm: number; property: { name: string; address: string; region: string } };
  tenant: { user: { firstName: string; lastName: string; email: string; phone?: string | null } };
  tenantSignatureUrl?: string | null;
  adminSignatureUrl?: string | null;
  signedAt?: Date | null;
}

export interface ReceiptDocData {
  id: string;
  leaseId: string | null;
  type: string;
  amountGHS: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paidAt?: Date | null;
  notes?: string | null;
  lease?: {
    leaseNumber: string;
    plot: { plotNumber: string; property: { name: string; address: string } };
    tenant: { user: { firstName: string; lastName: string; email: string } };
    rentRecords?: { periodYear: number; periodMonth: number; amountDueGHS: number }[];
  } | null;
}

function buildLeaseHtml(data: LeaseDocData): string {
  const months = Math.round(
    (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );
  const totalLease = data.monthlyRentGHS * months;

  const body = `
    <div class="header">
      <div><h1>GeoLand Pro</h1><div style="font-size:9pt;opacity:0.7">Property Management Platform</div></div>
      <div class="doc-type"><div style="font-size:14pt;font-weight:bold">TENANCY AGREEMENT</div><div>${data.leaseNumber}</div></div>
    </div>
    <div style="padding:0 4px">

      <div class="section">
        <div class="section-title">Property &amp; Plot Details</div>
        <div class="grid-2">
          <div class="field"><label>Property Name</label><span>${data.plot.property.name}</span></div>
          <div class="field"><label>Plot Number</label><span>${data.plot.plotNumber}</span></div>
          <div class="field"><label>Address</label><span>${data.plot.property.address}</span></div>
          <div class="field"><label>Region</label><span>${data.plot.property.region}</span></div>
          <div class="field"><label>Plot Area</label><span>${data.plot.areaSqm.toLocaleString()} m²</span></div>
          <div class="field"><label>GPS Coordinates (Snapshot)</label><span>${data.plotCentroidLat.toFixed(6)}, ${data.plotCentroidLng.toFixed(6)}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Tenant Details</div>
        <div class="grid-2">
          <div class="field"><label>Full Name</label><span>${data.tenant.user.firstName} ${data.tenant.user.lastName}</span></div>
          <div class="field"><label>Email Address</label><span>${data.tenant.user.email}</span></div>
          ${data.tenant.user.phone ? `<div class="field"><label>Phone</label><span>${data.tenant.user.phone}</span></div>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Lease Terms</div>
        <div class="highlight-box">
          <div class="grid-2">
            <div class="field"><label>Start Date</label><span>${formatDate(data.startDate)}</span></div>
            <div class="field"><label>End Date</label><span>${formatDate(data.endDate)}</span></div>
            <div class="field"><label>Duration</label><span>${months} month${months !== 1 ? 's' : ''}</span></div>
            <div class="field"><label>Status</label><span class="badge badge-active">${data.status}</span></div>
          </div>
        </div>
        <div style="margin-top:10px">
          <table>
            <tr><th>Description</th><th style="text-align:right">Amount (GHS)</th></tr>
            <tr><td>Monthly Rent</td><td style="text-align:right">${formatCurrency(data.monthlyRentGHS)}</td></tr>
            <tr><td>Security Deposit</td><td style="text-align:right">${formatCurrency(data.depositAmountGHS)}</td></tr>
            <tr><td><strong>Total Lease Value (${months} months)</strong></td><td style="text-align:right"><strong>${formatCurrency(totalLease)}</strong></td></tr>
          </table>
        </div>
      </div>

      ${data.notes ? `<div class="section"><div class="section-title">Additional Notes</div><p style="font-size:10pt;color:#444">${data.notes}</p></div>` : ''}

      <div class="section">
        <div class="section-title">Standard Terms &amp; Conditions</div>
        <ol style="font-size:9pt;color:#555;padding-left:16px;line-height:1.8">
          <li>The tenant shall pay rent on or before the due date each month.</li>
          <li>The security deposit is refundable subject to satisfactory property condition at handover.</li>
          <li>The tenant shall not sub-let the plot without prior written consent from the property owner.</li>
          <li>Either party may terminate this agreement with 30 days written notice, subject to the terms herein.</li>
          <li>The GPS coordinates recorded in this agreement constitute the legal boundary of the leased plot.</li>
          <li>Any alterations to the plot require written approval from the property manager.</li>
        </ol>
      </div>

      <div class="section">
        <div class="section-title">Signatures</div>
        <div class="grid-2" style="gap:16px;margin-top:8px">
          <div>
            <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">TENANT SIGNATURE</p>
            <div class="sig-box">
              ${data.tenantSignatureUrl ? `<img src="${data.tenantSignatureUrl}" style="max-height:50px;max-width:100%">` : ''}
              <p>${data.tenant.user.firstName} ${data.tenant.user.lastName}</p>
            </div>
          </div>
          <div>
            <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">PROPERTY OWNER / MANAGER SIGNATURE</p>
            <div class="sig-box">
              ${data.adminSignatureUrl ? `<img src="${data.adminSignatureUrl}" style="max-height:50px;max-width:100%">` : ''}
              <p>${data.signedAt ? `Signed on ${formatDate(data.signedAt)}` : 'Pending signature'}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        Generated by GeoLand Pro · ${new Date().toLocaleDateString('en-GB')} · This document is legally binding upon execution by both parties.
      </div>
    </div>
  `;

  return wrapHtml(`Tenancy Agreement — ${data.leaseNumber}`, body);
}

function buildReceiptHtml(data: ReceiptDocData): string {
  const receiptNo = `RCP-${data.id.slice(-8).toUpperCase()}`;
  const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const periodRow = data.lease?.rentRecords?.[0]
    ? `${MONTH_NAMES[data.lease.rentRecords[0].periodMonth]} ${data.lease.rentRecords[0].periodYear}`
    : '—';

  const body = `
    <div class="header">
      <div><h1>GeoLand Pro</h1><div style="font-size:9pt;opacity:0.7">Property Management Platform</div></div>
      <div class="doc-type"><div style="font-size:14pt;font-weight:bold">RENT RECEIPT</div><div>${receiptNo}</div></div>
    </div>
    <div style="padding:0 4px">

      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Receipt Number</label><span>${receiptNo}</span></div>
          <div class="field"><label>Date Issued</label><span>${formatDate(data.paidAt ?? new Date())}</span></div>
          <div class="field"><label>Transaction Type</label><span>${data.type.replace('_', ' ')}</span></div>
          ${data.paymentMethod ? `<div class="field"><label>Payment Method</label><span>${data.paymentMethod}</span></div>` : ''}
          ${data.paymentReference ? `<div class="field"><label>Reference / MoMo ID</label><span>${data.paymentReference}</span></div>` : ''}
          ${data.lease ? `<div class="field"><label>Lease Number</label><span>${data.lease.leaseNumber}</span></div>` : ''}
        </div>
      </div>

      ${data.lease ? `
      <div class="section">
        <div class="section-title">Tenant &amp; Property Details</div>
        <div class="grid-2">
          <div class="field"><label>Tenant Name</label><span>${data.lease.tenant.user.firstName} ${data.lease.tenant.user.lastName}</span></div>
          <div class="field"><label>Email</label><span>${data.lease.tenant.user.email}</span></div>
          <div class="field"><label>Property</label><span>${data.lease.plot.property.name}</span></div>
          <div class="field"><label>Plot Number</label><span>${data.lease.plot.plotNumber}</span></div>
          <div class="field"><label>Address</label><span>${data.lease.plot.property.address}</span></div>
          <div class="field"><label>Payment Period</label><span>${periodRow}</span></div>
        </div>
      </div>` : ''}

      <div class="section">
        <div class="section-title">Payment Summary</div>
        <div class="highlight-box" style="text-align:center">
          <div style="font-size:9pt;color:#666;margin-bottom:4px">AMOUNT RECEIVED</div>
          <div class="amount">${formatCurrency(data.amountGHS)}</div>
        </div>
      </div>

      ${data.notes ? `<div class="section"><div class="section-title">Notes</div><p style="font-size:10pt;color:#444">${data.notes}</p></div>` : ''}

      <div class="footer">
        Generated by GeoLand Pro · ${new Date().toLocaleDateString('en-GB')} · Please retain this receipt for your records.
      </div>
    </div>
  `;

  return wrapHtml(`Rent Receipt — ${receiptNo}`, body);
}

// ─── Brand-aware header & footer (QR + watermark) ──────────────────────────────

function buildBrandHeader(docTypeLabel: string, referenceNo: string): string {
  return `
    <div class="header">
      <div><h1>${brand.name}</h1><div style="font-size:9pt;opacity:0.7">${brand.companyName}</div></div>
      <div class="doc-type"><div style="font-size:14pt;font-weight:bold">${docTypeLabel}</div><div>${referenceNo}</div></div>
    </div>
  `;
}

async function buildFooterHtml(documentId: string, referenceNo: string): Promise<string> {
  const verifyUrl = `https://${brand.domain}/verify/${documentId}`;
  let qrImg = '';
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
    qrImg = `<img src="${qrDataUrl}" style="width:64px;height:64px" alt="Verification QR code" />`;
  } catch {
    qrImg = '';
  }

  return `
    <div class="footer" style="display:flex;justify-content:space-between;align-items:center;text-align:left;gap:12px">
      <div>
        <div>${brand.watermark}</div>
        <div>Reference: ${referenceNo}</div>
        <div>Verify online: ${verifyUrl}</div>
      </div>
      ${qrImg}
    </div>
  `;
}

// ─── Boundary geometry helpers ──────────────────────────────────────────────────

interface PolygonGeoJSON {
  coordinates?: number[][][];
}

function getOuterRing(geojson: unknown): number[][] {
  const g = geojson as PolygonGeoJSON | undefined;
  return g?.coordinates?.[0] ?? [];
}

function buildBoundarySvg(geojson: unknown, size = 320): string {
  const ring = getOuterRing(geojson);
  if (ring.length < 3) {
    return '<div style="font-size:9pt;color:#888;padding:12px">No boundary geometry available</div>';
  }

  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  const pad = 20;

  const points = ring
    .map(([lng, lat]) => {
      const x = pad + ((lng - minLng) / spanLng) * (size - pad * 2);
      const y = pad + (1 - (lat - minLat) / spanLat) * (size - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return `<svg viewBox="0 0 ${size} ${size}" width="100%" height="${size}" style="background:#f0f4f8;border:1px solid #ddd">
    <polygon points="${points}" fill="#1a3c5e33" stroke="#1a3c5e" stroke-width="2" />
  </svg>`;
}

function buildCoordinatesTable(geojson: unknown): string {
  let ring = getOuterRing(geojson);

  // Drop the closing point if it duplicates the first (GeoJSON polygons are closed rings)
  if (ring.length > 1) {
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1);
  }

  if (ring.length === 0) {
    return '<p style="font-size:9pt;color:#888">No GPS coordinates recorded for this plot.</p>';
  }

  const rows = ring
    .map(([lng, lat], i) => `<tr><td>${i + 1}</td><td>${lat.toFixed(6)}</td><td>${lng.toFixed(6)}</td></tr>`)
    .join('');

  return `<table><tr><th>Point</th><th>Latitude</th><th>Longitude</th></tr>${rows}</table>`;
}

function buildBoundaryDescription(geojson: unknown, areaSqm: number): string {
  const ring = getOuterRing(geojson);
  const pointCount = Math.max(ring.length - 1, 0);
  return (
    `The plot is bounded by a closed polygon comprising ${pointCount} GPS-surveyed boundary point${pointCount === 1 ? '' : 's'}, ` +
    `as set out in the coordinate schedule above, enclosing a total area of ${areaSqm.toLocaleString()} m². ` +
    `All boundary points were captured by GPS survey equipment and are recorded to six decimal places of precision.`
  );
}

// ─── 1. Boundary certificate ────────────────────────────────────────────────────

export interface BoundaryCertificateData {
  documentId: string;
  referenceNo: string;
  plot: {
    plotNumber: string;
    areaSqm: number;
    centroidLat: number | null;
    centroidLng: number | null;
    boundaryGeoJSON: unknown;
  };
  property: { name: string; address: string; region: string };
  owner: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
  issueDate: Date;
}

async function buildBoundaryCertificateHtml(data: BoundaryCertificateData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);
  const centroid =
    data.plot.centroidLat != null && data.plot.centroidLng != null
      ? `${data.plot.centroidLat.toFixed(6)}, ${data.plot.centroidLng.toFixed(6)}`
      : '—';

  const body = `
    ${buildBrandHeader('BOUNDARY CERTIFICATE', data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="highlight-box">
          This certificate confirms the GPS-verified boundary of the plot as recorded in the
          ${brand.name} land management system.
        </div>
      </div>

      <div class="section">
        <div class="section-title">Plot &amp; Property Details</div>
        <div class="grid-2">
          <div class="field"><label>Plot Number</label><span>${data.plot.plotNumber}</span></div>
          <div class="field"><label>Property</label><span>${data.property.name}</span></div>
          <div class="field"><label>Address</label><span>${data.property.address}</span></div>
          <div class="field"><label>Region</label><span>${data.property.region}</span></div>
          <div class="field"><label>Plot Area</label><span>${data.plot.areaSqm.toLocaleString()} m²</span></div>
          <div class="field"><label>Centroid (Lat, Lng)</label><span>${centroid}</span></div>
        </div>
      </div>

      ${data.owner ? `
      <div class="section">
        <div class="section-title">Registered Owner</div>
        <div class="grid-2">
          <div class="field"><label>Name</label><span>${data.owner.firstName} ${data.owner.lastName}</span></div>
          <div class="field"><label>Email</label><span>${data.owner.email}</span></div>
          ${data.owner.phone ? `<div class="field"><label>Phone</label><span>${data.owner.phone}</span></div>` : ''}
        </div>
      </div>` : ''}

      <div class="section">
        <div class="section-title">Boundary Plan</div>
        ${buildBoundarySvg(data.plot.boundaryGeoJSON)}
      </div>

      <div class="section">
        <div class="section-title">GPS Coordinates</div>
        ${buildCoordinatesTable(data.plot.boundaryGeoJSON)}
      </div>

      <div class="section">
        <div class="section-title">Boundary Description</div>
        <p style="font-size:10pt;color:#444">${buildBoundaryDescription(data.plot.boundaryGeoJSON, data.plot.areaSqm)}</p>
      </div>

      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Date of Issue</label><span>${formatDate(data.issueDate)}</span></div>
          <div class="field"><label>Certificate Reference</label><span>${data.referenceNo}</span></div>
        </div>
      </div>

      ${footer}
    </div>
  `;

  return wrapHtml(`Boundary Certificate — ${data.referenceNo}`, body);
}

// ─── 2. Plot certificate ─────────────────────────────────────────────────────────

export interface PlotCertificateData {
  documentId: string;
  referenceNo: string;
  plot: {
    plotNumber: string;
    areaSqm: number;
    status: string;
    centroidLat: number | null;
    centroidLng: number | null;
  };
  property: { name: string; address: string; region: string };
  tenant: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
  lease: { leaseNumber: string; startDate: Date; endDate: Date; monthlyRentGHS: number } | null;
  issueDate: Date;
}

async function buildPlotCertificateHtml(data: PlotCertificateData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);
  const centroid =
    data.plot.centroidLat != null && data.plot.centroidLng != null
      ? `${data.plot.centroidLat.toFixed(6)}, ${data.plot.centroidLng.toFixed(6)}`
      : '—';

  const body = `
    ${buildBrandHeader('PLOT CERTIFICATE', data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="highlight-box">
          This certificate confirms the registration details of the plot below within the ${brand.name} land management system.
        </div>
      </div>

      <div class="section">
        <div class="section-title">Plot Details</div>
        <div class="grid-2">
          <div class="field"><label>Plot Number</label><span>${data.plot.plotNumber}</span></div>
          <div class="field"><label>Status</label><span class="badge badge-active">${data.plot.status}</span></div>
          <div class="field"><label>Area</label><span>${data.plot.areaSqm.toLocaleString()} m²</span></div>
          <div class="field"><label>Centroid (Lat, Lng)</label><span>${centroid}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Property Location</div>
        <div class="grid-2">
          <div class="field"><label>Property</label><span>${data.property.name}</span></div>
          <div class="field"><label>Address</label><span>${data.property.address}</span></div>
          <div class="field"><label>Region</label><span>${data.property.region}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Current Occupancy</div>
        ${data.tenant && data.lease ? `
        <div class="grid-2">
          <div class="field"><label>Tenant</label><span>${data.tenant.firstName} ${data.tenant.lastName}</span></div>
          <div class="field"><label>Lease Number</label><span>${data.lease.leaseNumber}</span></div>
          <div class="field"><label>Lease Period</label><span>${formatDate(data.lease.startDate)} – ${formatDate(data.lease.endDate)}</span></div>
          <div class="field"><label>Monthly Rent</label><span>${formatCurrency(data.lease.monthlyRentGHS)}</span></div>
        </div>` : `<p style="font-size:10pt;color:#666">This plot currently has no active tenant.</p>`}
      </div>

      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Date of Issue</label><span>${formatDate(data.issueDate)}</span></div>
          <div class="field"><label>Certificate Reference</label><span>${data.referenceNo}</span></div>
        </div>
      </div>

      ${footer}
    </div>
  `;

  return wrapHtml(`Plot Certificate — ${data.referenceNo}`, body);
}

// ─── 3. Rent demand letter ───────────────────────────────────────────────────────

export interface DemandLetterData {
  documentId: string;
  referenceNo: string;
  tenant: { firstName: string; lastName: string; email: string; phone?: string | null };
  plot: { plotNumber: string };
  property: { name: string; address: string };
  lease: { leaseNumber: string };
  arrearsGHS: number;
  monthsOverdue: number;
  issueDate: Date;
  deadlineDate: Date;
}

async function buildDemandLetterHtml(data: DemandLetterData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);

  const body = `
    ${buildBrandHeader('RENT DEMAND LETTER', data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Date</label><span>${formatDate(data.issueDate)}</span></div>
          <div class="field"><label>Reference</label><span>${data.referenceNo}</span></div>
        </div>
      </div>

      <div class="section">
        <p style="font-size:10pt">To: <strong>${data.tenant.firstName} ${data.tenant.lastName}</strong></p>
        ${data.tenant.phone ? `<p style="font-size:10pt">Phone: ${data.tenant.phone}</p>` : ''}
        <p style="font-size:10pt">Re: Lease ${data.lease.leaseNumber} — Plot ${data.plot.plotNumber}, ${data.property.name}, ${data.property.address}</p>
      </div>

      <div class="section">
        <div class="section-title">Formal Demand for Payment of Outstanding Rent</div>
        <p style="font-size:10pt;color:#333;line-height:1.8">
          Dear ${data.tenant.firstName} ${data.tenant.lastName},<br><br>
          Our records show that your rent account for Plot ${data.plot.plotNumber} at ${data.property.name} is
          currently <strong>${data.monthsOverdue} month${data.monthsOverdue === 1 ? '' : 's'}</strong> in arrears,
          with a total outstanding balance as set out below.
        </p>
      </div>

      <div class="section">
        <div class="highlight-box" style="text-align:center">
          <div style="font-size:9pt;color:#666;margin-bottom:4px">TOTAL AMOUNT DUE</div>
          <div class="amount">${formatCurrency(data.arrearsGHS)}</div>
        </div>
      </div>

      <div class="section">
        <p style="font-size:10pt;color:#333;line-height:1.8">
          You are required to settle this outstanding balance in full within
          <strong>14 days</strong> of the date of this letter, i.e. on or before
          <strong>${formatDate(data.deadlineDate)}</strong>.
        </p>
        <p style="font-size:10pt;color:#333;line-height:1.8;margin-top:8px">
          Failure to settle this amount by the stated deadline may result in further action,
          including but not limited to termination of your tenancy agreement in accordance with
          its terms, without further notice.
        </p>
      </div>

      <div class="section">
        <div class="section-title">Payment Instructions</div>
        <p style="font-size:10pt;color:#333;line-height:1.8">
          Please make payment via Mobile Money or bank transfer using the reference
          <strong>${data.lease.leaseNumber}</strong>, and contact ${brand.companyName}
          (${brand.supportEmail}${brand.phone ? `, ${brand.phone}` : ''}) once payment has been made.
        </p>
      </div>

      <div class="section" style="margin-top:24px">
        <p style="font-size:10pt">Yours faithfully,</p>
        <p style="font-size:10pt;font-weight:bold;margin-top:24px">${brand.companyName}</p>
      </div>

      ${footer}
    </div>
  `;

  return wrapHtml(`Rent Demand Letter — ${data.referenceNo}`, body);
}

// ─── 4. Lands Commission submission package ─────────────────────────────────────

export interface LCSubmissionData {
  documentId: string;
  referenceNo: string;
  plot: {
    plotNumber: string;
    areaSqm: number;
    boundaryGeoJSON: unknown;
    description?: string | null;
  };
  property: { name: string; address: string; region: string; district: string };
  owner: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
  issueDate: Date;
}

async function buildLCSubmissionHtml(data: LCSubmissionData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);
  const pageBreak = 'style="page-break-before: always"';

  const sitePlanPage = `
    ${buildBrandHeader('LANDS COMMISSION SUBMISSION — SITE PLAN', data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="section-title">Site Plan</div>
        ${buildBoundarySvg(data.plot.boundaryGeoJSON, 400)}
      </div>
      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Plot Number</label><span>${data.plot.plotNumber}</span></div>
          <div class="field"><label>Area</label><span>${data.plot.areaSqm.toLocaleString()} m²</span></div>
          <div class="field"><label>Property</label><span>${data.property.name}</span></div>
          <div class="field"><label>Locality</label><span>${data.property.district}, ${data.property.region}</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">GPS Coordinates</div>
        ${buildCoordinatesTable(data.plot.boundaryGeoJSON)}
      </div>
    </div>
  `;

  const ownershipPage = `
    <div ${pageBreak}>
      ${buildBrandHeader('OWNERSHIP DECLARATION', data.referenceNo)}
      <div style="padding:0 4px">
        <div class="section">
          <div class="section-title">Declaration of Ownership</div>
          <p style="font-size:10pt;color:#333;line-height:1.8">
            I, the undersigned, declare that I am the lawful owner of the plot of land described in this
            submission, situated at ${data.property.address}, ${data.property.district}, ${data.property.region},
            and registered as Plot ${data.plot.plotNumber} within the ${brand.name} land management system.
          </p>
        </div>
        ${data.owner ? `
        <div class="section">
          <div class="section-title">Owner Details</div>
          <div class="grid-2">
            <div class="field"><label>Name</label><span>${data.owner.firstName} ${data.owner.lastName}</span></div>
            <div class="field"><label>Email</label><span>${data.owner.email}</span></div>
            ${data.owner.phone ? `<div class="field"><label>Phone</label><span>${data.owner.phone}</span></div>` : ''}
          </div>
        </div>` : ''}
        <div class="section" style="margin-top:24px">
          <div class="grid-2" style="gap:16px">
            <div>
              <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">OWNER SIGNATURE</p>
              <div class="sig-box"></div>
            </div>
            <div>
              <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">DATE</p>
              <div class="sig-box"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const boundaryPage = `
    <div ${pageBreak}>
      ${buildBrandHeader('BOUNDARY DESCRIPTION', data.referenceNo)}
      <div style="padding:0 4px">
        <div class="section">
          <div class="section-title">GPS Coordinate Schedule</div>
          ${buildCoordinatesTable(data.plot.boundaryGeoJSON)}
        </div>
        <div class="section">
          <div class="section-title">Narrative Description</div>
          <p style="font-size:10pt;color:#444">${buildBoundaryDescription(data.plot.boundaryGeoJSON, data.plot.areaSqm)}</p>
          ${data.plot.description ? `<p style="font-size:10pt;color:#444;margin-top:8px">${data.plot.description}</p>` : ''}
        </div>
      </div>
    </div>
  `;

  const surveyorPage = `
    <div ${pageBreak}>
      ${buildBrandHeader('SURVEYOR DECLARATION', data.referenceNo)}
      <div style="padding:0 4px">
        <div class="section">
          <div class="section-title">Licensed Surveyor Declaration</div>
          <p style="font-size:10pt;color:#333;line-height:1.8">
            I, the undersigned, being a Licensed Surveyor registered with the Survey and Mapping Division
            of the Lands Commission of Ghana, certify that the boundary coordinates and site plan
            presented in this submission accurately represent the plot described herein.
          </p>
        </div>
        <div class="section">
          <div class="grid-2">
            <div class="field"><label>Surveyor Name</label><span>&nbsp;</span></div>
            <div class="field"><label>Licence Number</label><span>&nbsp;</span></div>
          </div>
        </div>
        <div class="section" style="margin-top:24px">
          <div class="grid-2" style="gap:16px">
            <div>
              <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">SURVEYOR SIGNATURE</p>
              <div class="sig-box"></div>
            </div>
            <div>
              <p style="font-size:9pt;font-weight:bold;margin-bottom:4px">DATE &amp; STAMP</p>
              <div class="sig-box"></div>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="grid-2">
            <div class="field"><label>Date of Issue</label><span>${formatDate(data.issueDate)}</span></div>
            <div class="field"><label>Submission Reference</label><span>${data.referenceNo}</span></div>
          </div>
        </div>
        ${footer}
      </div>
    </div>
  `;

  return wrapHtml(`Lands Commission Submission — ${data.referenceNo}`, sitePlanPage + ownershipPage + boundaryPage + surveyorPage);
}

// ─── 5. Annual property report ───────────────────────────────────────────────────

export interface AnnualReportPlotRow {
  plotNumber: string;
  status: string;
  tenantName: string | null;
}

export interface AnnualReportData {
  documentId: string;
  referenceNo: string;
  property: { name: string; address: string; region: string };
  year: number;
  totalPlots: number;
  occupiedPlots: number;
  occupancyRate: number;
  totalIncomeGHS: number;
  quarterlyIncomeGHS: [number, number, number, number];
  totalArrearsGHS: number;
  leasesInArrears: number;
  alertCount: number;
  newLeasesCount: number;
  plots: AnnualReportPlotRow[];
  issueDate: Date;
}

async function buildAnnualReportHtml(data: AnnualReportData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);
  const plotRows = data.plots
    .map((p) => `<tr><td>${p.plotNumber}</td><td>${p.status}</td><td>${p.tenantName ?? '—'}</td></tr>`)
    .join('');

  const body = `
    ${buildBrandHeader(`ANNUAL PROPERTY REPORT — ${data.year}`, data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="section-title">Executive Summary</div>
        <p style="font-size:10pt;color:#444;line-height:1.8">
          This report summarises the performance of <strong>${data.property.name}</strong>
          (${data.property.address}, ${data.property.region}) for the ${data.year} calendar year,
          generated by the ${brand.name} platform.
        </p>
      </div>

      <div class="section">
        <div class="section-title">Occupancy Analysis</div>
        <div class="grid-2">
          <div class="field"><label>Total Plots</label><span>${data.totalPlots}</span></div>
          <div class="field"><label>Occupied Plots</label><span>${data.occupiedPlots}</span></div>
          <div class="field"><label>Occupancy Rate</label><span>${data.occupancyRate.toFixed(1)}%</span></div>
          <div class="field"><label>New Leases This Year</label><span>${data.newLeasesCount}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Income Breakdown</div>
        <table>
          <tr><th>Quarter</th><th style="text-align:right">Income (GHS)</th></tr>
          <tr><td>Q1 (Jan–Mar)</td><td style="text-align:right">${formatCurrency(data.quarterlyIncomeGHS[0])}</td></tr>
          <tr><td>Q2 (Apr–Jun)</td><td style="text-align:right">${formatCurrency(data.quarterlyIncomeGHS[1])}</td></tr>
          <tr><td>Q3 (Jul–Sep)</td><td style="text-align:right">${formatCurrency(data.quarterlyIncomeGHS[2])}</td></tr>
          <tr><td>Q4 (Oct–Dec)</td><td style="text-align:right">${formatCurrency(data.quarterlyIncomeGHS[3])}</td></tr>
          <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${formatCurrency(data.totalIncomeGHS)}</strong></td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Arrears Summary</div>
        <div class="grid-2">
          <div class="field"><label>Total Outstanding Arrears</label><span>${formatCurrency(data.totalArrearsGHS)}</span></div>
          <div class="field"><label>Leases In Arrears</label><span>${data.leasesInArrears}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Boundary Alert Summary</div>
        <p style="font-size:10pt;color:#444">
          ${data.alertCount} boundary alert event${data.alertCount === 1 ? ' was' : 's were'} recorded for this property during ${data.year}.
        </p>
      </div>

      <div class="section">
        <div class="section-title">Plot-by-Plot Status</div>
        <table>
          <tr><th>Plot</th><th>Status</th><th>Tenant</th></tr>
          ${plotRows}
        </table>
      </div>

      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Date of Issue</label><span>${formatDate(data.issueDate)}</span></div>
          <div class="field"><label>Report Reference</label><span>${data.referenceNo}</span></div>
        </div>
      </div>

      ${footer}
    </div>
  `;

  return wrapHtml(`Annual Property Report — ${data.property.name} — ${data.year}`, body);
}

// ─── 6. Tenant list (Vault pack component) ───────────────────────────────────────

export interface TenantListRow {
  plotNumber: string;
  tenantName: string | null;
  phone: string | null;
  leaseStatus: string;
  monthlyRentGHS: number | null;
  arrearsGHS: number;
}

export interface TenantListData {
  documentId: string;
  referenceNo: string;
  property: { name: string; address: string; region: string };
  year: number;
  tenants: TenantListRow[];
  issueDate: Date;
}

async function buildTenantListHtml(data: TenantListData): Promise<string> {
  const footer = await buildFooterHtml(data.documentId, data.referenceNo);
  const rows = data.tenants
    .map(
      (t) => `<tr>
        <td>${t.plotNumber}</td>
        <td>${t.tenantName ?? '—'}</td>
        <td>${t.phone ?? '—'}</td>
        <td>${t.leaseStatus}</td>
        <td style="text-align:right">${t.monthlyRentGHS != null ? formatCurrency(t.monthlyRentGHS) : '—'}</td>
        <td style="text-align:right">${formatCurrency(t.arrearsGHS)}</td>
      </tr>`
    )
    .join('');

  const body = `
    ${buildBrandHeader('TENANT LIST', data.referenceNo)}
    <div style="padding:0 4px">
      <div class="section">
        <div class="section-title">Property</div>
        <div class="grid-2">
          <div class="field"><label>Property Name</label><span>${data.property.name}</span></div>
          <div class="field"><label>Address</label><span>${data.property.address}, ${data.property.region}</span></div>
          <div class="field"><label>Year</label><span>${data.year}</span></div>
          <div class="field"><label>Total Plots Listed</label><span>${data.tenants.length}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Tenants</div>
        <table>
          <tr><th>Plot</th><th>Tenant</th><th>Phone</th><th>Lease Status</th><th style="text-align:right">Monthly Rent</th><th style="text-align:right">Arrears</th></tr>
          ${rows}
        </table>
      </div>

      <div class="section">
        <div class="grid-2">
          <div class="field"><label>Date of Issue</label><span>${formatDate(data.issueDate)}</span></div>
          <div class="field"><label>Document Reference</label><span>${data.referenceNo}</span></div>
        </div>
      </div>

      ${footer}
    </div>
  `;

  return wrapHtml(`Tenant List — ${data.property.name} — ${data.year}`, body);
}

// ─── 7. Audit log report (Master Control — Module 5) ─────────────────────────────

export interface AuditLogReportRow {
  createdAt: Date | string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  actor: { name: string; email: string; organisationName: string | null } | null;
}

export interface AuditLogReportData {
  generatedAt: Date;
  filters: { organisation?: string; actor?: string; action?: string; entityType?: string; from?: string; to?: string };
  rows: AuditLogReportRow[];
}

function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function buildAuditLogReportHtml(data: AuditLogReportData): string {
  const filterEntries = Object.entries(data.filters).filter(([, value]) => value);
  const filtersHtml = filterEntries.length
    ? filterEntries.map(([key, value]) => `<div class="field"><label>${key}</label><span>${value}</span></div>`).join('')
    : '<div class="field"><span>All organisations, actors, and actions</span></div>';

  const rows = data.rows
    .map(
      (row) => `<tr>
        <td>${formatDateTime(row.createdAt)}</td>
        <td>${row.action}</td>
        <td>${row.entityType} / ${row.entityId}</td>
        <td>${row.actor ? `${row.actor.name}<br><span style="color:#888;font-size:8pt">${row.actor.email}</span>` : '—'}</td>
        <td>${row.actor?.organisationName ?? '—'}</td>
        <td>${row.ipAddress ?? '—'}</td>
      </tr>`
    )
    .join('');

  const body = `
    ${buildBrandHeader('AUDIT LOG REPORT', formatDateTime(data.generatedAt))}
    <div style="padding:0 4px">
      <div class="section">
        <div class="section-title">Filters</div>
        <div class="grid-2">${filtersHtml}</div>
      </div>

      <div class="section">
        <div class="section-title">Events (${data.rows.length})</div>
        <table>
          <tr><th>Date</th><th>Action</th><th>Entity</th><th>Actor</th><th>Organisation</th><th>IP Address</th></tr>
          ${rows}
        </table>
      </div>

      <div class="footer">Generated ${formatDateTime(data.generatedAt)} — confidential platform security report</div>
    </div>
  `;

  return wrapHtml('Audit Log Report', body);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const pdfService = {
  async generateLeaseAgreement(data: LeaseDocData): Promise<Buffer> {
    return htmlToPdf(buildLeaseHtml(data));
  },

  async generateRentReceipt(data: ReceiptDocData): Promise<Buffer> {
    return htmlToPdf(buildReceiptHtml(data));
  },

  async generateBoundaryCertificate(data: BoundaryCertificateData): Promise<Buffer> {
    return htmlToPdf(await buildBoundaryCertificateHtml(data));
  },

  async generatePlotCertificate(data: PlotCertificateData): Promise<Buffer> {
    return htmlToPdf(await buildPlotCertificateHtml(data));
  },

  async generateDemandLetter(data: DemandLetterData): Promise<Buffer> {
    return htmlToPdf(await buildDemandLetterHtml(data));
  },

  async generateLCSubmissionPackage(data: LCSubmissionData): Promise<Buffer> {
    return htmlToPdf(await buildLCSubmissionHtml(data));
  },

  async generateAnnualReport(data: AnnualReportData): Promise<Buffer> {
    return htmlToPdf(await buildAnnualReportHtml(data));
  },

  async generateTenantList(data: TenantListData): Promise<Buffer> {
    return htmlToPdf(await buildTenantListHtml(data));
  },

  async generateAuditLogReport(data: AuditLogReportData): Promise<Buffer> {
    return htmlToPdf(buildAuditLogReportHtml(data));
  },
};
