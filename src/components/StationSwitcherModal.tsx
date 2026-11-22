import { useState } from 'react';
import { Check, MapPin, Plus, Trash2, X, Sun, Moon } from 'lucide-react';
import type { StationWorkspace } from '../types/reben.ts';
import type { AppStrings } from '../data/appI18n.ts';

interface StationSwitcherModalProps {
  open: boolean;
  stations: StationWorkspace[];
  activeStationId: string;
  strings: AppStrings;
  onSelect: (id: string) => void;
  onAdd: (name: string, copyPrices: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function StationSwitcherModal({
  open,
  stations,
  activeStationId,
  strings,
  onSelect,
  onAdd,
  onDelete,
  onClose,
}: StationSwitcherModalProps) {
  const [newName, setNewName] = useState('');
  const [copyPrices, setCopyPrices] = useState(true);

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(newName.trim(), copyPrices);
    setNewName('');
  };

  return (
    <div
      className="history-modal"
      role="dialog"
      aria-modal="true"
      aria-label={strings.stationsTitle}
      style={{ display: 'flex' }}
      dir={strings.rtl ? 'rtl' : 'ltr'}
    >
      <div className="history-header" style={{ marginBottom: 10 }}>
        <div>
          <span className="history-title">{strings.stationsTitle}</span>
          <p className="station-modal-sub">{strings.stationsSub}</p>
        </div>
        <button className="history-close" onClick={onClose} type="button" aria-label="Close">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Clean Create Station Box */}
      <form className="station-add-card" onSubmit={handleCreate}>
        <div className="station-add-row">
          <input
            type="text"
            className="station-add-input"
            placeholder={strings.newStationPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="station-add-btn">
            <Plus className="w-4 h-4" />
            <span>{strings.addStationBtn}</span>
          </button>
        </div>
        <label className="station-copy-toggle">
          <input
            type="checkbox"
            checked={copyPrices}
            onChange={(e) => setCopyPrices(e.target.checked)}
          />
          <span>{strings.copyPricesLabel}</span>
        </label>
      </form>

      {/* Saved Stations List */}
      <div className="history-list" style={{ marginTop: 12 }}>
        {stations.map((st) => {
          const isActive = st.id === activeStationId;
          const displayName = st.stationName.trim() || strings.unnamedStation;
          const priceSummary = [
            st.prices.p91 ? `91: ${st.prices.p91}` : '',
            st.prices.p95 ? `95: ${st.prices.p95}` : '',
            st.prices.pd ? `D: ${st.prices.pd}` : '',
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={st.id}
              className={`station-switch-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(st.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(st.id);
                }
              }}
            >
              <div className="station-switch-main">
                <div className="station-switch-title-row">
                  <MapPin className="w-4 h-4 shrink-0 text-[var(--reben-red)]" />
                  <span className="station-switch-name">{displayName}</span>
                  {isActive && (
                    <span className="station-active-pill">
                      <Check className="w-3 h-3" />
                      <span>{strings.activeBadge}</span>
                    </span>
                  )}
                </div>

                <div className="station-switch-meta" dir="ltr">
                  <span className="inline-flex items-center gap-1">
                    {st.isDayTime ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                    {st.isDayTime ? strings.shiftDay : strings.shiftNight}
                  </span>
                  <span>·</span>
                  <span>
                    {st.nozzles.length} {strings.nozzlesCountSuffix}
                  </span>
                  {priceSummary && (
                    <>
                      <span>·</span>
                      <span>{priceSummary}</span>
                    </>
                  )}
                </div>
              </div>

              {stations.length > 1 && !isActive && (
                <button
                  type="button"
                  className="station-del-btn"
                  aria-label="Delete station"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(st.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
