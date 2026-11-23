import { Crown, Megaphone } from 'lucide-react';
import type { AppStrings } from '../data/appI18n.ts';

interface AdBannerBarProps {
  visible: boolean;
  strings: AppStrings;
  onUpgradeClick: () => void;
}

export function AdBannerBar({ visible, strings, onUpgradeClick }: AdBannerBarProps) {
  if (!visible) return null;

  return (
    <div className="ad-banner-bar" dir={strings.rtl ? 'rtl' : 'ltr'}>
      <div className="ad-banner-left">
        <span className="ad-banner-tag">
          <Megaphone className="w-3 h-3" />
          <span>AD</span>
        </span>
        <span className="ad-banner-text">{strings.adBannerLabel}</span>
      </div>
      <button
        type="button"
        className="ad-banner-pro-btn"
        onClick={onUpgradeClick}
      >
        <Crown className="w-3 h-3" />
        <span>{strings.adBannerRemoveAdsBtn}</span>
      </button>
    </div>
  );
}
