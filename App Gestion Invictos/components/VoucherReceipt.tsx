import React from 'react';
import { StoreVoucher } from '../types';
import { qrDataUrl } from '../services/qrCode';

const fmt = (n: number) => Number(n || 0).toLocaleString('es-AR', {style:'currency',currency:'ARS'});
export default function VoucherReceipt({ voucher, onClose }: {voucher: StoreVoucher | null; onClose: () => void}) {
  if (!voucher) return null;
  const qr = qrDataUrl(voucher.code);
  const title = voucher.kind === 'gift_card' ? 'GIFT CARD' : 'NOTA DE CRÉDITO';
  const text = `INVICTOS - ${title}\nCódigo: ${voucher.code}\nImporte: ${fmt(voucher.initialAmount)}\nSaldo a consultar en Caja.`;
  const copy = async () => { await navigator.clipboard.writeText(text); };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Permití las ventanas emergentes para imprimir.'); return; }
    const safe = (value: string) => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch));
    w.document.write(`<html><head><title>${title} INVICTOS</title><style>body{font-family:Arial;text-align:center;padding:35px}h1{letter-spacing:4px}article{border:2px solid #111;padding:24px;max-width:480px;margin:auto}strong{font-size:25px}small{display:block;margin:12px}</style></head><body><article><h1>INVICTOS</h1><h2>${title}</h2><strong>${safe(fmt(voucher.initialAmount))}</strong><p>${safe(voucher.kind === 'gift_card' ? `De: ${voucher.giver || '-'} / Para: ${voucher.recipient || '-'}` : `A favor de: ${voucher.customerName || 'Portador'}`)}</p><p>${safe(voucher.dedication || '')}</p><p><img style="width:170px;height:170px" src="${qr}"/></p><p>Código: <b>${safe(voucher.code)}</b></p><small>Presentar este código en Caja. El saldo válido se consulta en el sistema.</small></article></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  const downloadImage = () => {
    const canvas=document.createElement('canvas'); canvas.width=720;canvas.height=900;
    const c=canvas.getContext('2d'); if (!c) return;
    c.fillStyle='#fff';c.fillRect(0,0,720,900);c.fillStyle='#141414';
    c.textAlign='center';c.font='bold 48px Arial';c.fillText('INVICTOS',360,95);
    c.font='bold 36px Arial';c.fillText(title,360,165);
    c.font='bold 50px Arial';c.fillText(fmt(voucher.initialAmount),360,240);
    c.font='24px Arial';
    if(voucher.kind==='gift_card') { c.fillText(`De: ${voucher.giver || '-'}`.slice(0,42),360,290);c.fillText(`Para: ${voucher.recipient || '-'}`.slice(0,42),360,330); }
    else c.fillText(`A favor de: ${(voucher.customerName || 'Portador').slice(0,34)}`,360,300);
    const img=new Image();img.onload=()=>{
      c.drawImage(img,210,360,300,300);c.font='20px monospace';c.fillText(voucher.code,360,710);
      c.font='16px Arial';c.fillText('Saldo sujeto a validación en Caja',360,758);
      const a=document.createElement('a');a.download=`${voucher.code}.jpg`;a.href=canvas.toDataURL('image/jpeg',0.93);a.click();
    };img.src=qr;
  };
  const share = async () => {
    if (navigator.share) {
      try {await navigator.share({title:`${title} INVICTOS`,text}); return;} catch {return;}
    }
    await copy(); window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };
  return <div className="fixed inset-0 z-[150] bg-black/60 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl text-center">
      <h2 className="text-2xl font-bold">INVICTOS · {title}</h2>
      <p className="text-3xl font-bold">{fmt(voucher.initialAmount)}</p>
      {voucher.giver && <p>De: {voucher.giver}</p>}
      {voucher.recipient && <p>Para: {voucher.recipient}</p>}
      {voucher.customerName && <p>A favor de: {voucher.customerName}</p>}
      {voucher.dedication && <p>{voucher.dedication}</p>}
      <img src={qr} alt="Código QR del vale" className="w-40 h-40 mx-auto" />
      <div className="font-mono text-sm break-all bg-slate-100 p-3 rounded">{voucher.code}</div>
      <p className="text-xs text-slate-500">Saldo validado en Caja. El código es al portador.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={print} className="px-3 py-2 rounded bg-indigo-600 text-white">Imprimir / PDF</button>
        <button onClick={downloadImage} className="px-3 py-2 rounded border">Descargar JPG</button>
        <button onClick={share} className="px-3 py-2 rounded bg-green-600 text-white">WhatsApp / Compartir</button>
        <button onClick={copy} className="px-3 py-2 border rounded">Copiar</button>
        <button onClick={onClose} className="px-3 py-2 border rounded">Cerrar</button>
      </div>
    </div>
  </div>;
}
