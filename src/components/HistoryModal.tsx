import { useEffect, useState } from 'react';
import { Lock, Trash2, X } from 'lucide-react';
import type { HistoryShiftEntry } from '../types/reben.ts';
import type { AppStrings } from '../data/appI18n.ts';
import { updateAdminPin, verifyAdminPin } from '../utils/adminConfig.ts';

interface HistoryModalProps {
  open: boolean;
  items: HistoryShiftEntry[];
  currencyCode?: string;
  strings: AppStrings;
  onSelect: (entry: HistoryShiftEntry) => void;
  onDeleteItem: (id: number) => void;
  onClearAll: () => void;
  onNotify?: (msg: string, kind?: '' | 'ok' | 'warn') => void;
  onClose: () => void;
}

type PendingDelete = { type: 'single'; id: number } | { type: 'all' } | null;

export function HistoryModal({
  open,
  items,
  currencyCode = 'SAR',
  strings,
  onSelect,
  onDeleteItem,
  onClearAll,
  onNotify,
  onClose,
}: HistoryModalProps) {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [changeMode, setChangeMode] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [changeError, setChangeError] = useState(false);

  useEffect(() => {
    if (!open) {
      setPendingDelete(null);
      setPinInput('');
      setPinError(false);
      setChangeMode(false);
      setCurrentPinInput('');
      setNewPinInput('');
      setChangeError(false);
    }
  }, [open]);

  if (!open) return null;

  const openPasswordPrompt = (target: PendingDelete) => {
    setPendingDelete(target);
    setPinInput('');
    setPinError(false);
    setChangeMode(false);
    setCurrentPinInput('');
    setNewPinInput('');
    setChangeError(false);
  };

  const closePasswordPrompt = () => {
    setPendingDelete(null);
    setPinInput('');
    setPinError(false);
    setChangeMode(false);
  };

  const handleConfirmDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDelete) return;
    if (!verifyAdminPin(pinInput)) {
      setPinError(true);
      return;
    }
    if (pendingDelete.type === 'all') {
      onClearAll();
    } else {
      onDeleteItem(pendingDelete.id);
    }
    closePasswordPrompt();
    onNotify?.(strings.historyDeletedToast, 'ok');
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateAdminPin(currentPinInput, newPinInput)) {
      setChangeError(true);
      return;
    }
    setChangeMode(false);
    setCurrentPinInput('');
    setNewPinInput('');
    setChangeError(false);
    setPinInput('');
    onNotify?.(strings.passwordChangedToast, 'ok');
  };

  return (
    <div
      className="history-modal"
      id="historyModal"
      style={{ display: 'flex' }}
      dir={strings.rtl ? 'rtl' : 'ltr'}
    >
      <div className="history-header">
        <span className="history-title">{strings.historyTitle}</span>
        <div className="history-header-actions">
          {items.length > 0 && (
            <button
              type="button"
              className="history-clear-btn"
              onClick={() => openPasswordPrompt({ type: 'all' })}
              aria-label={strings.clearAllBtn}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{strings.clearAllBtn}</span>
            </button>
          )}
          <button className="history-close" onClick={onClose} type="button" aria-label="Close history">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="history-list" id="historyList">
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            {strings.noHistory}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="history-item" onClick={() => onSelect(item)}>
              <div className="history-item-header">
                <span className="history-item-date">{item.date}</span>
                <span className="history-item-shift">
                  {item.shift === 'Day' ? strings.shiftDay : strings.shiftNight}
                </span>
              </div>
              <div className="history-item-station">{item.station}</div>
              <div className="history-item-bottom">
                <div className="history-item-total" dir="ltr">
                  {item.summary.total} {currencyCode}
                </div>
                <button
                  type="button"
                  className="history-del-btn"
                  aria-label="Delete history entry"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPasswordPrompt({ type: 'single', id: item.id });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Password confirmation dialog for deleting history */}
      {pendingDelete && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-box">
            {!changeMode ? (
              <form onSubmit={handleConfirmDelete}>
                <div className="confirm-title flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
                  <span>
                    {pendingDelete.type === 'all'
                      ? strings.deleteAllHistoryTitle
                      : strings.deleteHistoryTitle}
                  </span>
                </div>
                <div className="confirm-msg" style={{ marginBottom: 12 }}>
                  {strings.enterPasswordPrompt}
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  className={`pin-input ${pinError ? 'invalid' : ''}`}
                  placeholder={strings.passwordPlaceholder}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    if (pinError) setPinError(false);
                  }}
                />
                {pinError && <div className="pin-error-text">{strings.wrongPasswordError}</div>}
                <div className="confirm-actions" style={{ marginTop: 14 }}>
                  <button type="button" className="confirm-btn" onClick={closePasswordPrompt}>
                    {strings.cancelBtn}
                  </button>
                  <button type="submit" className="confirm-btn primary">
                    {strings.deleteConfirm}
                  </button>
                </div>
                <button
                  type="button"
                  className="pin-change-link"
                  onClick={() => {
                    setChangeMode(true);
                    setChangeError(false);
                  }}
                >
                  {strings.changePasswordLink}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSaveNewPin}>
                <div className="confirm-title flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[var(--reben-red)] shrink-0" />
                  <span>{strings.changePasswordLink}</span>
                </div>
                <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    className={`pin-input ${changeError ? 'invalid' : ''}`}
                    placeholder={strings.currentPasswordPlaceholder}
                    value={currentPinInput}
                    onChange={(e) => {
                      setCurrentPinInput(e.target.value);
                      if (changeError) setChangeError(false);
                    }}
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    className={`pin-input ${changeError && newPinInput.trim() === '' ? 'invalid' : ''}`}
                    placeholder={strings.newPasswordPlaceholder}
                    value={newPinInput}
                    onChange={(e) => {
                      setNewPinInput(e.target.value);
                      if (changeError) setChangeError(false);
                    }}
                  />
                </div>
                {changeError && <div className="pin-error-text">{strings.wrongPasswordError}</div>}
                <div className="confirm-actions" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="confirm-btn"
                    onClick={() => setChangeMode(false)}
                  >
                    {strings.cancelBtn}
                  </button>
                  <button type="submit" className="confirm-btn primary">
                    {strings.saveBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
