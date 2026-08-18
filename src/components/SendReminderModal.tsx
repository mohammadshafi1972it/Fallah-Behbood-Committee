import React, { useState, useEffect } from 'react';
import { X, Send, Copy, Check, MessageSquare, Bell, Users, AlertCircle, Share2, Sparkles, PhoneCall } from 'lucide-react';
import { formatMoney } from '../lib/ledgerUtils';

export interface OverdueMemberItem {
  ledgerNo: string;
  name: string;
  outstanding: number;
  month: string;
  phone?: string;
  status: 'Due' | 'Partial' | 'Paid';
  monthlyDue?: number;
  paid?: number;
}

interface SendReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  overdueMembers: OverdueMemberItem[];
  organizationName: string;
  selectedMonth: string; // YYYY-MM
  singleTarget?: OverdueMemberItem | null;
  showToast: (msg: string) => void;
}

export const SendReminderModal: React.FC<SendReminderModalProps> = ({
  isOpen,
  onClose,
  overdueMembers,
  organizationName,
  selectedMonth,
  singleTarget,
  showToast,
}) => {
  const [selectedMember, setSelectedMember] = useState<OverdueMemberItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'batch'>('individual');
  const [customPhone, setCustomPhone] = useState('');
  const [templateStyle, setTemplateStyle] = useState<'bilingual' | 'english' | 'concise'>('bilingual');
  const [customMessage, setCustomMessage] = useState('');
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // Format month name e.g. "2026-08" -> "August 2026"
  const getMonthLabel = (mStr: string) => {
    if (!mStr) return 'Current Month';
    const [year, month] = mStr.split('-');
    if (!year || !month) return mStr;
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const monthLabel = getMonthLabel(selectedMonth);
  const orgName = organizationName || 'Fallah Behbood Committee';

  // Individual message templates
  const buildIndividualMessage = (item: OverdueMemberItem, style: 'bilingual' | 'english' | 'concise') => {
    if (style === 'bilingual') {
      return `السلام علیکم ورحمۃ اللہ وبرکاتہ
محترم ${item.name} صاحب (لیجر نمبر: ${item.ledgerNo})،

امید ہے آپ بخیر ہوں گے۔ ${orgName} کی طرف سے یاد دہانی کہ ماہ ${monthLabel} کی ماہانہ فلاحی فیس / چندہ مبلغ Rs. ${item.outstanding}/- ابھی تک واجب الادا ہے۔

براہ کرم فلاحی امور کی بروقت انجام دہی کے لیے اپنے بقایا جات جلد از جلد ادا فرمائیں۔

جزاکم اللہ خیراً و احسن الجزاء۔
— انتظامیہ: ${orgName}`;
    } else if (style === 'english') {
      return `Assalamu Alaikum / Dear ${item.name},

This is a gentle payment reminder from ${orgName} regarding your monthly subscription due of Rs. ${item.outstanding} for ${monthLabel} (Ledger No. ${item.ledgerNo}).

Kindly clear your pending dues at your earliest convenience to support our welfare initiatives.

JazakAllah Khair / Thank you.
— Management, ${orgName}`;
    } else {
      return `Reminder: Dear ${item.name} (L.No ${item.ledgerNo}), your monthly due for ${monthLabel} of Rs. ${item.outstanding} is pending with ${orgName}. Kindly clear at earliest. Thank you.`;
    }
  };

  // Batch message template
  const generateBatchMessage = () => {
    const listLines = overdueMembers
      .map((m, idx) => `${idx + 1}. Ledger #${m.ledgerNo} — ${m.name}: Rs. ${m.outstanding}`)
      .join('\n');

    const totalOutstandingSum = overdueMembers.reduce((sum, m) => sum + (m.outstanding || 0), 0);

    return `📢 *ماہانہ فیس یاد دہانی / PENDING DUES REPORT — ${monthLabel.toUpperCase()}*
🏢 *${orgName.toUpperCase()}*

محترم اراکین کمیٹی،
السلام علیکم، ماہ ${monthLabel} کے بقایا فلاحی چندہ کی تفصیل درج ذیل ہے:

${listLines}

📊 *کل بقایا ممبران (Total Pending):* ${overdueMembers.length}
💰 *مجموعی واجب الادا رقم (Total Outstanding):* Rs. ${totalOutstandingSum}

آپ سب کے تعاون اور فلاحی جذبے کا بے حد شکریہ۔
— انتظامیہ ${orgName}`;
  };

  useEffect(() => {
    if (singleTarget) {
      setSelectedMember(singleTarget);
      setCustomPhone(singleTarget.phone || '');
      setActiveTab('individual');
      setCustomMessage(buildIndividualMessage(singleTarget, templateStyle));
      setIsEditingMessage(false);
    } else if (overdueMembers.length > 0) {
      const first = overdueMembers[0];
      setSelectedMember(first);
      setCustomPhone(first.phone || '');
      setCustomMessage(buildIndividualMessage(first, templateStyle));
      setIsEditingMessage(false);
    }
  }, [singleTarget, overdueMembers, isOpen]);

  useEffect(() => {
    if (selectedMember && !isEditingMessage) {
      setCustomMessage(buildIndividualMessage(selectedMember, templateStyle));
    }
  }, [templateStyle, selectedMember]);

  if (!isOpen) return null;

  const currentMessage = customMessage || (selectedMember ? buildIndividualMessage(selectedMember, templateStyle) : '');
  const batchMessage = generateBatchMessage();

  const handleCopyIndividual = () => {
    if (!currentMessage) return;
    navigator.clipboard.writeText(currentMessage);
    setCopied(true);
    showToast(`Reminder text for ${selectedMember?.name} copied to clipboard!`);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyBatch = () => {
    navigator.clipboard.writeText(batchMessage);
    setCopiedBatch(true);
    showToast(`Batch reminder list for ${overdueMembers.length} members copied!`);
    setTimeout(() => setCopiedBatch(false), 2500);
  };

  const cleanPhoneNumber = (phone: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    // If starts with 0 and is 11 digits (e.g. Pakistan 0300...), replace leading 0 with 92
    if (clean.startsWith('0') && clean.length === 11) {
      clean = '92' + clean.slice(1);
    }
    // If 10 digits without country code, assume subcontinent/India 91 if needed or leave as is
    return clean;
  };

  const handleSendWhatsApp = () => {
    if (!selectedMember) return;
    const text = encodeURIComponent(currentMessage);
    const cleanPhone = cleanPhoneNumber(customPhone);
    let url = '';
    if (cleanPhone && cleanPhone.length >= 10) {
      url = `https://wa.me/${cleanPhone}?text=${text}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${text}`;
    }
    window.open(url, '_blank');
  };

  const handleSendBatchWhatsApp = () => {
    const text = encodeURIComponent(batchMessage);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <span>Send WhatsApp Due Reminders</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                  {overdueMembers.length} Overdue
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                {monthLabel} • Monthly Dues & Payment Notifications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('individual')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'individual'
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Individual Member Message</span>
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'batch'
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Batch Group Announcement ({overdueMembers.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {overdueMembers.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">All Dues Cleared!</h4>
              <p className="text-xs text-slate-500">
                There are no pending dues recorded for any member for {monthLabel}.
              </p>
            </div>
          ) : activeTab === 'individual' ? (
            <>
              {/* Member Selector dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Overdue Member ({overdueMembers.length} available):
                </label>
                <select
                  value={selectedMember?.ledgerNo || ''}
                  onChange={(e) => {
                    const found = overdueMembers.find((m) => m.ledgerNo === e.target.value);
                    if (found) {
                      setSelectedMember(found);
                      setCustomPhone(found.phone || '');
                      setIsEditingMessage(false);
                      setCustomMessage(buildIndividualMessage(found, templateStyle));
                    }
                  }}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-slate-800"
                >
                  {overdueMembers.map((m) => (
                    <option key={m.ledgerNo} value={m.ledgerNo}>
                      L.No {m.ledgerNo} — {m.name} (Due: Rs. {m.outstanding})
                    </option>
                  ))}
                </select>
              </div>

              {selectedMember && (
                <>
                  {/* Summary Card */}
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-800 block">
                        Member Account
                      </span>
                      <strong className="text-slate-900 text-sm font-serif">{selectedMember.name}</strong>
                      <span className="text-slate-500 block">Ledger #{selectedMember.ledgerNo}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-amber-800 block">
                        Outstanding Due
                      </span>
                      <strong className="text-rose-700 text-sm font-mono font-bold">
                        {formatMoney(selectedMember.outstanding)}
                      </strong>
                      <span className="text-[10px] text-slate-500 block">For {monthLabel}</span>
                    </div>
                  </div>

                  {/* Phone & Template Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Recipient WhatsApp / Phone Number:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 919876543210 or 0300..."
                        value={customPhone}
                        onChange={(e) => setCustomPhone(e.target.value)}
                        className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Message Language / Style:
                      </label>
                      <select
                        value={templateStyle}
                        onChange={(e) => {
                          const style = e.target.value as any;
                          setTemplateStyle(style);
                          if (selectedMember) {
                            setCustomMessage(buildIndividualMessage(selectedMember, style));
                            setIsEditingMessage(false);
                          }
                        }}
                        className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-slate-800 cursor-pointer"
                      >
                        <option value="bilingual">Urdu / Islamic (السلام علیکم)</option>
                        <option value="english">Formal English</option>
                        <option value="concise">Short & Concise SMS</option>
                      </select>
                    </div>
                  </div>

                  {/* Message Preview / Live Editor */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <span>WhatsApp Message Content</span>
                        <span className="text-[10px] text-slate-400 font-normal">(Editable)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedMember) {
                            setCustomMessage(buildIndividualMessage(selectedMember, templateStyle));
                            setIsEditingMessage(false);
                            showToast('Message reset to default template.');
                          }
                        }}
                        className="text-[10px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        Reset to template
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={currentMessage}
                      onChange={(e) => {
                        setCustomMessage(e.target.value);
                        setIsEditingMessage(true);
                      }}
                      className="w-full bg-slate-900 text-emerald-300 p-3 rounded-xl text-xs font-sans whitespace-pre-wrap leading-relaxed border border-slate-800 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            /* Batch Tab */
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-900">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Share this comprehensive formatted announcement containing all {overdueMembers.length} members with
                  pending dues for {monthLabel} directly to your Committee WhatsApp group.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Batch Group Announcement Preview:
                </label>
                <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-slate-800">
                  {batchMessage}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>

          {activeTab === 'individual' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyIndividual}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-2xs cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>

              <button
                onClick={handleSendWhatsApp}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Open in WhatsApp</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBatch}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-2xs cursor-pointer"
              >
                {copiedBatch ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copiedBatch ? 'List Copied!' : 'Copy Batch List'}</span>
              </button>

              <button
                onClick={handleSendBatchWhatsApp}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share to WhatsApp Group</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

