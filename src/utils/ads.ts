import type { LicenseEvaluation } from '../types/reben.ts';
import { IS_ANDROID_APP } from './rebenExport.ts';

export type RewardedAdOutcome = 'rewarded' | 'dismissed' | 'unavailable';

export function isAdSupportedMode(evaluation: LicenseEvaluation): boolean {
  return evaluation.unlocked && evaluation.status === 'free_ads';
}

export function syncAndroidAdsState(adsEnabled: boolean): void {
  if (!IS_ANDROID_APP || !window.AndroidBridge) return;
  try {
    window.AndroidBridge.setAdsEnabled?.(adsEnabled);
  } catch {}
}

export function requestNativeRewardedAd(placement: string): Promise<RewardedAdOutcome> {
  if (
    typeof window === 'undefined' ||
    !IS_ANDROID_APP ||
    !window.AndroidBridge ||
    typeof window.AndroidBridge.showRewardedAd !== 'function'
  ) {
    return Promise.resolve('unavailable');
  }

  return new Promise((resolve) => {
    const cbName = `__rebenAdRewardCb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let settled = false;
    const win = window as unknown as Record<string, unknown>;

    const cleanup = () => {
      try {
        delete win[cbName];
      } catch {
        win[cbName] = undefined;
      }
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve('unavailable');
    }, 90000);

    win[cbName] = (rewarded: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve(rewarded ? 'rewarded' : 'dismissed');
    };

    try {
      window.AndroidBridge!.showRewardedAd!(placement, cbName);
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve('unavailable');
      }
    }
  });
}

export const ANDROID_ADMOB_KOTLIN_SNIPPET = `// Add inside your Android WebView JavaScriptInterface ("AndroidBridge")
// Requires com.google.android.gms:play-services-ads (AdMob SDK)

@JavascriptInterface
fun setAdsEnabled(enabled: Boolean) {
    activity.runOnUiThread {
        adBannerView.visibility = if (enabled) View.VISIBLE else View.GONE
        if (enabled && !bannerLoaded) {
            bannerLoaded = true
            adBannerView.loadAd(AdRequest.Builder().build())
        }
    }
}

@JavascriptInterface
fun showRewardedAd(placement: String, callbackName: String) {
    activity.runOnUiThread {
        val ad = rewardedAd
        if (ad == null) {
            // Let web fallback countdown handle it & preload next ad
            loadRewardedAd()
            webView.evaluateJavascript("window['$callbackName']?.(true)", null)
            return@runOnUiThread
        }
        var earnedReward = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                rewardedAd = null
                loadRewardedAd()
                webView.evaluateJavascript("window['$callbackName']?.($earnedReward)", null)
            }
            override fun onAdFailedToShowFullScreenContent(err: AdError) {
                rewardedAd = null
                loadRewardedAd()
                webView.evaluateJavascript("window['$callbackName']?.(true)", null)
            }
        }
        ad.show(activity) { _ ->
            earnedReward = true
        }
    }
}`;
