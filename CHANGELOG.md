# [2.8.0](https://github.com/mascarell/rapi-bot/compare/v2.7.0...v2.8.0) (2026-03-28)


### Features

* add Fandom wiki fallback for missing DotGG character art ([#234](https://github.com/mascarell/rapi-bot/issues/234)) ([6169749](https://github.com/mascarell/rapi-bot/commit/6169749311c7f360f6e54faebadab821edaa1098))

# [2.7.0](https://github.com/mascarell/rapi-bot/compare/v2.6.0...v2.7.0) (2026-03-28)


### Features

* wire asset sync scheduler into service initializer ([#233](https://github.com/mascarell/rapi-bot/issues/233)) ([c30464b](https://github.com/mascarell/rapi-bot/commit/c30464bbb7f6ad3f591c511788efe63fc34318fa))

# [2.6.0](https://github.com/mascarell/rapi-bot/compare/v2.5.3...v2.6.0) (2026-03-27)


### Features

* add game asset sync framework with NIKKE provider ([#232](https://github.com/mascarell/rapi-bot/issues/232)) ([9573a00](https://github.com/mascarell/rapi-bot/commit/9573a00f0ac41104f5b17427a25dc8c11fb960b1))

## [2.5.3](https://github.com/mascarell/rapi-bot/compare/v2.5.2...v2.5.3) (2026-03-27)


### Bug Fixes

* replace raw notification type slugs with display names in footers ([#230](https://github.com/mascarell/rapi-bot/issues/230)) ([a0c909e](https://github.com/mascarell/rapi-bot/commit/a0c909e09db2a4312a3b41a3947a09ca45c615a6))

## [2.5.2](https://github.com/mascarell/rapi-bot/compare/v2.5.1...v2.5.2) (2026-03-27)


### Bug Fixes

* polish notification DM footers with Rapi avatar and clean text ([#229](https://github.com/mascarell/rapi-bot/issues/229)) ([eb69182](https://github.com/mascarell/rapi-bot/commit/eb6918265e11fe0a5aee815d3c380556c4f890cd))

## [2.5.1](https://github.com/mascarell/rapi-bot/compare/v2.5.0...v2.5.1) (2026-03-27)


### Bug Fixes

* reset unbounded command usage stats on cleanup interval ([#228](https://github.com/mascarell/rapi-bot/issues/228)) ([ae2cb55](https://github.com/mascarell/rapi-bot/commit/ae2cb55fcb2299e001cfa39f4a4ec85147154e51))


### Performance Improvements

* cache S3 ListObjectsV2 calls on hot paths ([#226](https://github.com/mascarell/rapi-bot/issues/226)) ([a6517bb](https://github.com/mascarell/rapi-bot/commit/a6517bb6789c7241b7516facd7bdc0a6488643c2))
* parallelize startup and bump EmbedVotes cache TTL ([#227](https://github.com/mascarell/rapi-bot/issues/227)) ([6dad8a5](https://github.com/mascarell/rapi-bot/commit/6dad8a5194fcdaf175f8e51c3e804e09199facb1))

# [2.5.0](https://github.com/mascarell/rapi-bot/compare/v2.4.0...v2.5.0) (2026-03-27)


### Features

* add coupon alert DM notifications for new codes ([#225](https://github.com/mascarell/rapi-bot/issues/225)) ([55d777e](https://github.com/mascarell/rapi-bot/commit/55d777e7f4bb2923a97010abc417e758a3bc8802))
* add DM notification subscriptions for daily reset messages ([#224](https://github.com/mascarell/rapi-bot/issues/224)) ([8531fa2](https://github.com/mascarell/rapi-bot/commit/8531fa29c55ac1c99ac8a0eef425f83d5410ff3a))

# [2.4.0](https://github.com/mascarell/rapi-bot/compare/v2.3.0...v2.4.0) (2026-03-24)


### Bug Fixes

* resolve duplicate DMs and improve notification subscription UX ([4ad5954](https://github.com/mascarell/rapi-bot/commit/4ad595460c42ef4517a99758cc84566337886c98))
* resolve merge conflicts with master (new season notification) ([009cd86](https://github.com/mascarell/rapi-bot/commit/009cd86899dc532d411a37b8fdb53bb83df9c1ff))


### Features

* Add DM notification subscription framework ([c3ece42](https://github.com/mascarell/rapi-bot/commit/c3ece4232d865b2724aa26d7f6e9221f57c0f4c1))

# [2.3.0](https://github.com/mascarell/rapi-bot/compare/v2.2.0...v2.3.0) (2026-03-24)


### Features

* add new season notification for Mirror Wars ([d74d57f](https://github.com/mascarell/rapi-bot/commit/d74d57faa621d89f24516a6aeb98dd6b27117da5)), closes [#brown-dust-2](https://github.com/mascarell/rapi-bot/issues/brown-dust-2)

# [2.2.0](https://github.com/mascarell/rapi-bot/compare/v2.1.0...v2.2.0) (2026-03-15)


### Features

* show version and Discord timestamps in /age command ([d538fcb](https://github.com/mascarell/rapi-bot/commit/d538fcbc13c160e78aab72d56dafed61fd4a842b))

# [2.1.0](https://github.com/mascarell/rapi-bot/compare/v2.0.0...v2.1.0) (2026-03-15)


### Bug Fixes

* add Node 22 to release workflow and chain deploy after release ([ef51b9f](https://github.com/mascarell/rapi-bot/commit/ef51b9fd973bac79f6521784a6582e042cf37fd4))


### Features

* add semantic-release, husky, and commitlint ([fff252d](https://github.com/mascarell/rapi-bot/commit/fff252d4a710514e3043c2b78ffacd798bc503c6))
* tag Docker image with version from package.json ([ca2735a](https://github.com/mascarell/rapi-bot/commit/ca2735a40adb638c985e1dcca4e98a2a24dfed94))
