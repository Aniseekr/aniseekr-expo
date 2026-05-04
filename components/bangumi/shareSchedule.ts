import { RefObject } from 'react';
import { Share, Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Anime } from '../rate/types';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

const dayShort: Record<string, string> = {
  Mondays: 'Mon',
  Tuesdays: 'Tue',
  Wednesdays: 'Wed',
  Thursdays: 'Thu',
  Fridays: 'Fri',
  Saturdays: 'Sat',
  Sundays: 'Sun',
  Unknown: 'TBD',
};

export interface ShareScheduleOptions {
  seasonLabel: string;
  groupedAnime: DailyAnime[];
  totalCount: number;
  viewRef?: RefObject<View | null>;
}

/**
 * Capture a rendered view to a temp PNG file, returning the file URI.
 * Useful when you've mounted an off-screen poster component and want to
 * snapshot it before passing the URI to the share sheet.
 */
export async function captureScheduleImage(
  viewRef: RefObject<View | null>
): Promise<string | null> {
  if (!viewRef.current) return null;
  try {
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 0.95,
      result: 'tmpfile',
    });
    return uri;
  } catch {
    return null;
  }
}

function buildScheduleText({
  seasonLabel,
  groupedAnime,
  totalCount,
}: Pick<ShareScheduleOptions, 'seasonLabel' | 'groupedAnime' | 'totalCount'>): string {
  const lines: string[] = [`Aniseekr · ${seasonLabel}`, `${totalCount} series this season`, ''];

  groupedAnime.forEach((group) => {
    if (!group.anime.length) return;
    lines.push(`${dayShort[group.day] ?? group.day}`);
    group.anime.slice(0, 8).forEach((a) => {
      lines.push(`· ${a.title}`);
    });
    if (group.anime.length > 8) {
      lines.push(`  +${group.anime.length - 8} more`);
    }
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

async function shareText(message: string, seasonLabel: string): Promise<boolean> {
  try {
    const result = await Share.share(
      {
        message,
        title: `Aniseekr · ${seasonLabel}`,
      },
      {
        dialogTitle: 'Share schedule',
        subject: `Aniseekr · ${seasonLabel}`,
      }
    );
    return Platform.OS === 'ios' ? result.action === Share.sharedAction : true;
  } catch {
    return false;
  }
}

async function shareImage(uri: string, seasonLabel: string): Promise<boolean> {
  try {
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { url: uri, title: `Aniseekr · ${seasonLabel}` }
        : { message: uri, title: `Aniseekr · ${seasonLabel}` },
      {
        dialogTitle: 'Share schedule',
        subject: `Aniseekr · ${seasonLabel}`,
      }
    );
    return Platform.OS === 'ios' ? result.action === Share.sharedAction : true;
  } catch {
    return false;
  }
}

/**
 * Build a shareable rendition of the weekly schedule and dispatch the
 * system share sheet. When a `viewRef` is provided, capture an off-screen
 * poster as a PNG and share it; otherwise fall back to a plain-text dump.
 */
export async function shareSchedule({
  seasonLabel,
  groupedAnime,
  totalCount,
  viewRef,
}: ShareScheduleOptions): Promise<boolean> {
  const fallbackMessage = buildScheduleText({ seasonLabel, groupedAnime, totalCount });

  if (viewRef) {
    const uri = await captureScheduleImage(viewRef);
    if (uri) {
      const ok = await shareImage(uri, seasonLabel);
      if (ok) return true;
    }
  }

  return shareText(fallbackMessage, seasonLabel);
}
