# Contributing to Aniseekr

Thanks for your interest in helping. Aniseekr is a small, opinionated codebase — these notes will save you (and reviewers) time.

By submitting a contribution you agree that your work is licensed under the project's [Apache License 2.0](./LICENSE) and that you have the right to license it (DCO-style — no separate CLA is required).

## Ways to contribute

- **Bug reports** — open a [GitHub issue](https://github.com/Aniseekr/aniseekr-expo/issues) with reproduction steps, device + OS, and a build number (Settings → About).
- **Translations** — strings live alongside their feature folders; PRs welcome for `zh-Hant`, `zh-Hans`, `ja`, `en`, `ko`. Don't translate brand names or anime titles.
- **Pilgrimage spot data** — Anitabi is the source of truth. Submit corrections upstream at [github.com/anitabi/anitabi.cn-document](https://github.com/anitabi/anitabi.cn-document); we re-pull on every release.
- **Code** — features, fixes, refactors. Read the rules below before opening a PR.
- **Security** — see [README → Security](./README.md#security). Do **not** file public issues for vulnerabilities.

## Development setup

Requires [Bun](https://bun.sh), Node 20+, Xcode 16+ (for iOS), Android Studio (for Android).

```bash
git clone https://github.com/Aniseekr/aniseekr-expo.git
cd aniseekr-expo
bun install

bun run ios          # iOS simulator
bun run android      # Android emulator
bun run typecheck    # tsc --noEmit
bun test             # unit + integration tests
bun run lint         # ESLint + Prettier check
bun run format       # auto-fix
```

API keys are read from `.env`. Copy `.env.example` to `.env` and fill in the keys for the data sources you want to exercise — most sources work without a key, but AdMob, RevenueCat, and Google Sign-In require their own credentials.

## Rules that exist because of past bugs

These are the same rules listed in [`CLAUDE.md`](./CLAUDE.md). They are not stylistic preferences — each one maps to a real production bug we've already fixed.

1. **Themed primitives.** Use `ThemedButton`, `ThemedText`, `ThemedSurface`, `ThemedIconButton` from [`components/themed/`](./components/themed). Do not write a new `PrimaryButton` per screen.
2. **No hardcoded hex** on the render path. Colours come from `useTheme()`. The only hex literals allowed are inside the `THEMES` constant and the two universal text colours in `components/themed/contrast.ts`.
3. **Text contrast on accent backgrounds is computed, not assumed.** If you build a custom hit area, use `readableTextOn(accent)`.
4. **Sizing & touch targets.** Minimum 44×44. `ThemedButton size="md"` already meets that.
5. **No fake data.** If the real source isn't available, render an explicit loading or error state — never a plausible-looking placeholder. Specifically forbidden: hash/seed → "average colour" tricks, hardcoded anime titles in generic screens, mock arrays on the render path, fake counters/ratings/distances.
6. **State ownership.** Don't put every interaction, sensor tick, and async phase into the screen root. Use refs / SharedValues / feature hooks for hot state.
7. **Navigation feel.** Cache hit → frame 1 shows real chrome, not a skeleton. Detail screens read `{ id, title, poster }` from route params and paint immediately. Use `CacheService.getSync()` to seed `useState`; never `await` on the first-paint path.

If a PR adds another flavour of "PrimaryButton2", inlines `#0A0A0A`, or shows a skeleton on warm cache, it will be sent back. The full rationale (with examples) is in `CLAUDE.md`.

## PR checklist

- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] `bun run lint` passes (or `bun run format` then re-check)
- [ ] No new hardcoded hex on the render path
- [ ] No new top-level `useState` dumping ground (see CLAUDE rule 9)
- [ ] If you touched a detail / list screen, verify the skeleton does **not** flash on warm cache
- [ ] If you used Anitabi data on a new surface, the attribution chip is present
- [ ] If you added a runtime dependency, its licence is MIT / Apache-2.0 / BSD-2/3 / ISC. Anything else needs discussion before merge.

## Commit & PR style

We use Conventional Commits — see recent history for examples:

```
feat(pilgrimage): surface Anitabi CC BY-NC-SA attribution
fix(cloudkit): enable CloudKit service in entitlements
chore(monetization): gate premium UI behind FeatureFlags
```

Scope is the affected feature directory (`pilgrimage`, `rate`, `collection`, `bangumi`, …) or a top-level concern (`ad`, `android`, `ios`, `cloudkit`, `monetization`). Keep PR titles under 70 characters; put detail in the body.

## Adding a new data source

If you want to add a new aggregator (e.g. AniDB, LiveChart):

1. Add the client in `libs/services/data-sources/<name>-data-source.ts` and conform to the existing `AnimeDataSource` interface.
2. Wire it through `libs/services/data-source-config.ts`.
3. Add upstream attribution to [README → Data source attribution](./README.md#data-source-attribution) and [NOTICE](./NOTICE).
4. Document rate limits and authentication in the file header — every other source has them.
5. **Do not** ship API keys in the repo. Read from `.env` via `process.env.EXPO_PUBLIC_<NAME>_…`.

## Releasing

Releases are tagged from `main`. EAS Build produces the iOS `.ipa` and Android `.aab`. The submission scripts are in `scripts/android-submit.sh` and the EAS-managed iOS flow.

## Code of Conduct

Be kind. Disagreements are welcome; harassment is not. Behaviour that makes the project unwelcoming will get you a warning, then a ban. If you need to flag something privately, email [gm@aniseekr.moe](mailto:gm@aniseekr.moe).

## Questions

- General: [GitHub Discussions](https://github.com/Aniseekr/aniseekr-expo/discussions)
- Private / security / business: [gm@aniseekr.moe](mailto:gm@aniseekr.moe)
- Website: [aniseekr.moe](https://aniseekr.moe/)
