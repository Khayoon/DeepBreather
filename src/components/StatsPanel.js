import React, { useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, radius, space, type, fonts } from '../theme';
import { formatDuration } from '../lib/storage';
import useDialogFocus from '../lib/useDialogFocus';

/**
 * Practice history.
 *
 * Chart choices worth naming: the week view is a single series (sessions per
 * day), so it gets one hue and no legend — the caption names it. Values are not
 * printed on every bar; the shape is the point and the numbers live in the
 * tiles above. Days with no practice keep a visible baseline tick so an empty
 * week still reads as seven days rather than as missing data.
 */

function StatTile({ value, label, hint, tone = 'default' }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.tileValue, tone === 'accent' && { color: colors.accent }]}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

function WeekBars({ last7 }) {
  const max = Math.max(1, ...last7.map((d) => d.count));
  const H = 64;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Sessions per day</Text>
      <Text style={styles.cardSub}>last 7 days</Text>
      <View style={styles.barRow} accessibilityRole="image">
        {last7.map((d, i) => {
          const h = d.count ? Math.max(6, (d.count / max) * H) : 2;
          const isToday = i === last7.length - 1;
          return (
            <View key={d.key} style={styles.barSlot}>
              <View style={[styles.barTrack, { height: H }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: h,
                      backgroundColor: d.count
                        ? isToday
                          ? colors.primaryBright
                          : colors.primary
                        : colors.lineStrong,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function RetentionRow({ retentions }) {
  if (!retentions.length) return null;
  const max = Math.max(...retentions, 1);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Last session</Text>
      <Text style={styles.cardSub}>retention per round</Text>
      {retentions.map((secs, i) => (
        <View key={`${i}-${secs}`} style={styles.retRow}>
          <Text style={styles.retLabel}>R{i + 1}</Text>
          <View style={styles.retTrack}>
            <View style={[styles.retFill, { width: `${(secs / max) * 100}%` }]} />
          </View>
          <Text style={styles.retValue}>{formatDuration(secs)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function StatsPanel({ stats, onClose, onClear }) {
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef);
  const empty = stats.total === 0;
  return (
    <View style={styles.backdrop}>
      <View ref={dialogRef} style={styles.sheet} accessibilityViewIsModal role="dialog" aria-modal={true} accessibilityLabel="Practice history">
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Your practice</Text>
          <Pressable
            onPress={onClose}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Close practice history"
            style={styles.closeBtn}
          >
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        {empty ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyBody}>
              Finish a session and it shows up here — rounds, how long you held each
              retention, and how many days in a row you have practised.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tileRow}>
              <StatTile
                value={stats.streak}
                label={stats.streak === 1 ? 'day streak' : 'day streak'}
                hint={stats.bestStreak > stats.streak ? `best ${stats.bestStreak}` : 'best yet'}
                tone="accent"
              />
              <StatTile value={stats.total} label="sessions" hint={`${stats.totalMinutes} min total`} />
              <StatTile
                value={formatDuration(stats.bestRetention)}
                label="best hold"
                hint="all time"
              />
            </View>

            <WeekBars last7={stats.last7} />
            <RetentionRow retentions={stats.lastRetentions} />

            <Pressable
              onPress={onClear}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear all practice history"
            >
              <Text style={styles.clearText}>Clear history</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,7,15,0.82)',
    justifyContent: 'flex-end',
    zIndex: 40,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(6),
    paddingTop: space(4),
    paddingBottom: space(8),
    maxHeight: '86%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(4),
  },
  heading: { ...type.title, color: colors.text, fontFamily: fonts.body },
  closeBtn: { paddingVertical: space(2), paddingHorizontal: space(3) },
  closeText: { color: colors.primaryBright, fontSize: 16, fontWeight: '600', fontFamily: fonts.body },

  scroll: { flexGrow: 0 },
  scrollInner: { paddingBottom: space(2) },

  tileRow: { flexDirection: 'row', gap: space(3), marginBottom: space(4) },
  tile: {
    flex: 1,
    backgroundColor: colors.sheet,
    borderRadius: radius.md,
    paddingVertical: space(4),
    paddingHorizontal: space(3),
  },
  tileValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.body,
  },
  tileLabel: { color: colors.textDim, fontSize: 13, marginTop: 2, fontFamily: fonts.body },
  tileHint: { color: colors.textFaint, fontSize: 11.5, marginTop: 4, fontFamily: fonts.body },

  card: {
    backgroundColor: colors.sheet,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(4),
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700', fontFamily: fonts.body },
  cardSub: { color: colors.textFaint, fontSize: 12.5, marginTop: 1, fontFamily: fonts.body },

  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: space(4),
  },
  barSlot: { flex: 1, alignItems: 'center' },
  barTrack: { justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: {
    width: '58%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: { color: colors.textFaint, fontSize: 11.5, marginTop: space(2), fontFamily: fonts.body },
  barLabelToday: { color: colors.textDim, fontWeight: '700' },

  retRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(3) },
  retLabel: {
    color: colors.textFaint,
    fontSize: 12.5,
    width: 26,
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.body,
  },
  retTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  retFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  retValue: {
    color: colors.textDim,
    fontSize: 12.5,
    width: 62,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontFamily: fonts.body,
  },

  emptyWrap: { paddingVertical: space(8) },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', fontFamily: fonts.body },
  emptyBody: {
    color: colors.textDim,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: space(2),
    fontFamily: fonts.body,
  },

  clearBtn: { alignSelf: 'center', paddingVertical: space(3), paddingHorizontal: space(4) },
  clearText: { color: colors.textFaint, fontSize: 13.5, fontFamily: fonts.body },
});
