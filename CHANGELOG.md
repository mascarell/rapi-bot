# [2.27.0](https://github.com/mascarell/rapi-bot/compare/v2.26.3...v2.27.0) (2026-11-23)


### Features

* **mod:** add /mod jobs to show scheduled job status ([#278](https://github.com/mascarell/rapi-bot/issues/278)) ([e8220aa](https://github.com/mascarell/rapi-bot/commit/e8220aa5f38a21d17764bae7e253719fcb0d6753))
* **status:** add GTA VI to Rapi's playing statuses ([#279](https://github.com/mascarell/rapi-bot/issues/279)) ([4428310](https://github.com/mascarell/rapi-bot/commit/44283106c25f62af9d601214c9cd51c2d02c9b8e))

## [2.26.3](https://github.com/mascarell/rapi-bot/compare/v2.26.2...v2.26.3) (2026-11-23)


### Bug Fixes

* **scheduler:** pin daily and coupon jobs to UTC; spam stats show this hour ([#277](https://github.com/mascarell/rapi-bot/issues/277)) ([cbeb59e](https://github.com/mascarell/rapi-bot/commit/cbeb59e956c63a5eea309853f82171bc68af6d2e))

## [2.26.2](https://github.com/mascarell/rapi-bot/compare/v2.26.1...v2.26.2) (2026-11-23)


### Bug Fixes

* **commands:** tidy /spam check, /mod spam stats and /mod media, drop dead helpers ([#275](https://github.com/mascarell/rapi-bot/issues/275)) ([4e10ea9](https://github.com/mascarell/rapi-bot/commit/4e10ea96b8c9562a1d93707b8754491d92a25fea)), closes [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot)

## [2.26.1](https://github.com/mascarell/rapi-bot/compare/v2.26.0...v2.26.1) (2026-11-22)


### Bug Fixes

* **commands:** fixes from a review of every slash command ([#274](https://github.com/mascarell/rapi-bot/issues/274)) ([1be7ade](https://github.com/mascarell/rapi-bot/commit/1be7ade1ee5d14b2ff44130b8875fe3c3303d62c))

# [2.26.0](https://github.com/mascarell/rapi-bot/compare/v2.25.3...v2.26.0) (2026-11-22)


### Features

* **assets:** character sync runs hourly and once after startup ([#273](https://github.com/mascarell/rapi-bot/issues/273)) ([ef13e51](https://github.com/mascarell/rapi-bot/commit/ef13e5171bec503d9a78e1b808f37aef26873284))

## [2.25.3](https://github.com/mascarell/rapi-bot/compare/v2.25.2...v2.25.3) (2026-11-22)


### Bug Fixes

* **assets:** new NIKKE characters sync again, listed by Loot & Waifus ([#272](https://github.com/mascarell/rapi-bot/issues/272)) ([e5c183c](https://github.com/mascarell/rapi-bot/commit/e5c183cfce3ef5362a8ed130de02f76e38e83c92))

## [2.25.2](https://github.com/mascarell/rapi-bot/compare/v2.25.1...v2.25.2) (2026-11-22)


### Bug Fixes

* **chat:** chat commands work in every channel, limited only when spammed ([#271](https://github.com/mascarell/rapi-bot/issues/271)) ([eb671c8](https://github.com/mascarell/rapi-bot/commit/eb671c8560df1b3bdd28aa397a5cfa67c2bfee72)), closes [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot) [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot) [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot)

## [2.25.1](https://github.com/mascarell/rapi-bot/compare/v2.25.0...v2.25.1) (2026-11-21)


### Bug Fixes

* **mod:** /mod media list shows each gif with a link to open or download it ([#270](https://github.com/mascarell/rapi-bot/issues/270)) ([8e865b8](https://github.com/mascarell/rapi-bot/commit/8e865b81cbfbaec91d5c203713339ec1e104e873))

# [2.25.0](https://github.com/mascarell/rapi-bot/compare/v2.24.0...v2.25.0) (2026-11-21)


### Features

* **mod:** /mod media list and remove ([#269](https://github.com/mascarell/rapi-bot/issues/269)) ([e562042](https://github.com/mascarell/rapi-bot/commit/e56204228dec04c7a4217676da64e096898b4e3a))

# [2.24.0](https://github.com/mascarell/rapi-bot/compare/v2.23.1...v2.24.0) (2026-11-21)


### Features

* **mod:** register /mod per server; allowlist check never waits on storage ([#268](https://github.com/mascarell/rapi-bot/issues/268)) ([f17f251](https://github.com/mascarell/rapi-bot/commit/f17f251a222cc4080e708f1fcf083d9e23112194))

## [2.23.1](https://github.com/mascarell/rapi-bot/compare/v2.23.0...v2.23.1) (2026-11-21)


### Bug Fixes

* **commands:** every CZN detail in /mod redeem update and lookup; server-only commands ([#267](https://github.com/mascarell/rapi-bot/issues/267)) ([39bc8b1](https://github.com/mascarell/rapi-bot/commit/39bc8b1d048c33727c797678d734aa8ebbb2a884))

# [2.23.0](https://github.com/mascarell/rapi-bot/compare/v2.22.3...v2.23.0) (2026-11-21)


### Features

* **coupons:** pin new code posts and unpin them when the code ends ([#266](https://github.com/mascarell/rapi-bot/issues/266)) ([a2e67fe](https://github.com/mascarell/rapi-bot/commit/a2e67feddaf2f695af6b245e90d21359f8dab82a))

## [2.22.3](https://github.com/mascarell/rapi-bot/compare/v2.22.2...v2.22.3) (2026-11-21)


### Bug Fixes

* **commands:** home rules stay home, cooldown notices are private ([#265](https://github.com/mascarell/rapi-bot/issues/265)) ([349a11e](https://github.com/mascarell/rapi-bot/commit/349a11e3353f725ff69f9b146373c3c693a727ee)), closes [#rules](https://github.com/mascarell/rapi-bot/issues/rules) [#rules](https://github.com/mascarell/rapi-bot/issues/rules)

## [2.22.2](https://github.com/mascarell/rapi-bot/compare/v2.22.1...v2.22.2) (2026-11-21)


### Bug Fixes

* **commands:** rebuild /help as an embed and defer slow /redeem replies ([#264](https://github.com/mascarell/rapi-bot/issues/264)) ([c9ca3e7](https://github.com/mascarell/rapi-bot/commit/c9ca3e72c26e6d779661f56dde41decd94aad16a))

## [2.22.1](https://github.com/mascarell/rapi-bot/compare/v2.22.0...v2.22.1) (2026-11-21)


### Bug Fixes

* command review bugs, and /mod redeem limited to the home server ([#263](https://github.com/mascarell/rapi-bot/issues/263)) ([d249583](https://github.com/mascarell/rapi-bot/commit/d249583abc054f0d59a093c7ac5d53a6822700ef)), closes [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot)

# [2.22.0](https://github.com/mascarell/rapi-bot/compare/v2.21.0...v2.22.0) (2026-11-21)


### Bug Fixes

* stagger the six-hourly redeem run and make /stream url optional ([#260](https://github.com/mascarell/rapi-bot/issues/260)) ([c998bf1](https://github.com/mascarell/rapi-bot/commit/c998bf1d1606898398c25fe3b849160e3f374571))


### Features

* **mod:** add /mod media add for the booba? and booty? image pools ([#261](https://github.com/mascarell/rapi-bot/issues/261)) ([a0cb310](https://github.com/mascarell/rapi-bot/commit/a0cb3101fce69dfd8bc798753b83c142c694f7ae))

# [2.21.0](https://github.com/mascarell/rapi-bot/compare/v2.20.0...v2.21.0) (2026-11-21)


### Features

* **mod:** move /redeem moderator subcommands to /mod redeem ([#258](https://github.com/mascarell/rapi-bot/issues/258)) ([31aadbc](https://github.com/mascarell/rapi-bot/commit/31aadbc98d28138f7cf1b453261d06ed59bc3bc3))

# [2.20.0](https://github.com/mascarell/rapi-bot/compare/v2.19.0...v2.20.0) (2026-11-20)


### Features

* **mod:** move /spam moderator tools to /mod spam and share one moderator rule ([#257](https://github.com/mascarell/rapi-bot/issues/257)) ([3e4b472](https://github.com/mascarell/rapi-bot/commit/3e4b4721aaf742a6b90dbf7418d3afedb4babad6))

# [2.19.0](https://github.com/mascarell/rapi-bot/compare/v2.18.0...v2.19.0) (2026-11-20)


### Features

* post new coupon codes in the game's channel, with a Redeem for me button ([#256](https://github.com/mascarell/rapi-bot/issues/256)) ([e8863c2](https://github.com/mascarell/rapi-bot/commit/e8863c284cdc2d2abc68518d7a0ea0e9b74e8892)), closes [#chaos-zero-nightmare](https://github.com/mascarell/rapi-bot/issues/chaos-zero-nightmare) [#czn](https://github.com/mascarell/rapi-bot/issues/czn) [#brown-dust-2](https://github.com/mascarell/rapi-bot/issues/brown-dust-2) [#bd2](https://github.com/mascarell/rapi-bot/issues/bd2)

# [2.18.0](https://github.com/mascarell/rapi-bot/compare/v2.17.0...v2.18.0) (2026-11-20)


### Features

* make Chaos Zero Nightmare subscribing a form, and keep valid accounts ([#255](https://github.com/mascarell/rapi-bot/issues/255)) ([52d39c8](https://github.com/mascarell/rapi-bot/commit/52d39c8a1685664b5418858cac87e7ce853514e4))

# [2.17.0](https://github.com/mascarell/rapi-bot/compare/v2.16.2...v2.17.0) (2026-11-20)


### Features

* let moderators manage their server's slur list with /mod ([#254](https://github.com/mascarell/rapi-bot/issues/254)) ([d84a1dd](https://github.com/mascarell/rapi-bot/commit/d84a1dd57300866da63afcf77986b80962066c3d))

## [2.16.2](https://github.com/mascarell/rapi-bot/compare/v2.16.1...v2.16.2) (2026-10-18)


### Bug Fixes

* answer redeem subscribe before redeeming codes ([#253](https://github.com/mascarell/rapi-bot/issues/253)) ([6d097ae](https://github.com/mascarell/rapi-bot/commit/6d097ae214afa7664b2a561c28f0bcd875e45a0a))

## [2.16.1](https://github.com/mascarell/rapi-bot/compare/v2.16.0...v2.16.1) (2026-10-17)


### Bug Fixes

* read the czn server from the server option ([#252](https://github.com/mascarell/rapi-bot/issues/252)) ([eacd5d1](https://github.com/mascarell/rapi-bot/commit/eacd5d1d0b0d6d2eacbede752572f9ee2ecce042))

# [2.16.0](https://github.com/mascarell/rapi-bot/compare/v2.15.1...v2.16.0) (2026-10-13)


### Features

* auto-redeem Chaos Zero Nightmare coupons, sourced from Gachafeed ([#250](https://github.com/mascarell/rapi-bot/issues/250)) ([fcf8531](https://github.com/mascarell/rapi-bot/commit/fcf85314ca6a611af659932f3f03f9779bbde075))

## [2.15.1](https://github.com/mascarell/rapi-bot/compare/v2.15.0...v2.15.1) (2026-09-27)


### Bug Fixes

* keep the radio connected after a voice error ([#249](https://github.com/mascarell/rapi-bot/issues/249)) ([97fa4c3](https://github.com/mascarell/rapi-bot/commit/97fa4c3836a44acd32a4a1429cbbc87a5a7e1e64))

# [2.15.0](https://github.com/mascarell/rapi-bot/compare/v2.14.1...v2.15.0) (2026-08-28)


### Features

* announce NIKKE co-op when the co-op role is pinged ([#247](https://github.com/mascarell/rapi-bot/issues/247)) ([7f886d1](https://github.com/mascarell/rapi-bot/commit/7f886d199f4178b1fe1994a53d1a87a2980d242b))

## [2.14.1](https://github.com/mascarell/rapi-bot/compare/v2.14.0...v2.14.1) (2026-05-10)


### Bug Fixes

* cron jitter rolls Avalon/SR phase forward + 4h stagger for 1d/2d ([#246](https://github.com/mascarell/rapi-bot/issues/246)) ([62f8849](https://github.com/mascarell/rapi-bot/commit/62f8849049e38fe941727af3b0ff6e8282e9a246))

# [2.14.0](https://github.com/mascarell/rapi-bot/compare/v2.13.2...v2.14.0) (2026-05-09)


### Features

* restrict chat commands to #rapi-bot channel ([#245](https://github.com/mascarell/rapi-bot/issues/245)) ([022e421](https://github.com/mascarell/rapi-bot/commit/022e42168727fdb6d6c1796796c8e6db223b406f)), closes [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot) [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot) [#1](https://github.com/mascarell/rapi-bot/issues/1) [#rapi-bot](https://github.com/mascarell/rapi-bot/issues/rapi-bot)

## [2.13.2](https://github.com/mascarell/rapi-bot/compare/v2.13.1...v2.13.2) (2026-05-09)


### Bug Fixes

* correct Avalon/Star Reincarnation cycle and stagger warnings 1h before reset ([#244](https://github.com/mascarell/rapi-bot/issues/244)) ([db6a7a5](https://github.com/mascarell/rapi-bot/commit/db6a7a54d27bf77ad6bc34278dc4b6938eda5fc9))

## [2.13.1](https://github.com/mascarell/rapi-bot/compare/v2.13.0...v2.13.1) (2026-05-07)


### Bug Fixes

* correct lost sword avalon and star reincarnation anchor to 2026-05-10 ([#243](https://github.com/mascarell/rapi-bot/issues/243)) ([212b503](https://github.com/mascarell/rapi-bot/commit/212b503ee76f5bf7174e32c54b7f1734db3dac88))

# [2.13.0](https://github.com/mascarell/rapi-bot/compare/v2.12.0...v2.13.0) (2026-05-07)


### Features

* lost sword star reincarnation alerts and avalon anchor fix ([#242](https://github.com/mascarell/rapi-bot/issues/242)) ([ce02350](https://github.com/mascarell/rapi-bot/commit/ce02350a0969e9afd3a3a062f59441dc5a7cb4f0)), closes [#lost-sword](https://github.com/mascarell/rapi-bot/issues/lost-sword)

# [2.12.0](https://github.com/mascarell/rapi-bot/compare/v2.11.0...v2.12.0) (2026-05-07)


### Features

* lost sword avalon biweekly reminder alerts ([#241](https://github.com/mascarell/rapi-bot/issues/241)) ([fd662d5](https://github.com/mascarell/rapi-bot/commit/fd662d5a6efa3504327a4401b82431763604b5a2)), closes [#lost-sword](https://github.com/mascarell/rapi-bot/issues/lost-sword)

# [2.11.0](https://github.com/mascarell/rapi-bot/compare/v2.10.1...v2.11.0) (2026-04-27)


### Features

* dm offender and delete offending message on slur detection ([#240](https://github.com/mascarell/rapi-bot/issues/240)) ([465a9c1](https://github.com/mascarell/rapi-bot/commit/465a9c1f1b8178d861af638f3e18c0efd38b2d6f))

## [2.10.1](https://github.com/mascarell/rapi-bot/compare/v2.10.0...v2.10.1) (2026-04-27)


### Bug Fixes

* use word-boundary assertions to prevent slur substring false positives ([#239](https://github.com/mascarell/rapi-bot/issues/239)) ([986206a](https://github.com/mascarell/rapi-bot/commit/986206a10a745150313c88fc054edb69f4cc174e))

# [2.10.0](https://github.com/mascarell/rapi-bot/compare/v2.9.2...v2.10.0) (2026-04-25)


### Features

* add slur auto-moderation with mod-log embed and S3-backed list ([#238](https://github.com/mascarell/rapi-bot/issues/238)) ([8f0163e](https://github.com/mascarell/rapi-bot/commit/8f0163e61cdf7a3ebccebb997f200eef690e6955))

## [2.9.2](https://github.com/mascarell/rapi-bot/compare/v2.9.1...v2.9.2) (2026-04-07)


### Bug Fixes

* auto-unsubscribe users with invalid game IDs and notify via DM ([#237](https://github.com/mascarell/rapi-bot/issues/237)) ([fb1ad18](https://github.com/mascarell/rapi-bot/commit/fb1ad18c234da79d5d512ef372971a02026a86d7))

## [2.9.1](https://github.com/mascarell/rapi-bot/compare/v2.9.0...v2.9.1) (2026-04-07)


### Bug Fixes

* exclude IncorrectUser errors from circuit breaker ([#236](https://github.com/mascarell/rapi-bot/issues/236)) ([d12f087](https://github.com/mascarell/rapi-bot/commit/d12f087ce1d8cdde189813b56dd139da6059e29c))

# [2.9.0](https://github.com/mascarell/rapi-bot/compare/v2.8.0...v2.9.0) (2026-03-28)


### Features

* exclude collab characters from gacha pool via manifest ([#235](https://github.com/mascarell/rapi-bot/issues/235)) ([923a50c](https://github.com/mascarell/rapi-bot/commit/923a50c920c562744aa46fd4bfc2e8ce5ccfc480))

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
