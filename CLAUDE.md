# CLAUDE.md

**Repository:** `dwg7/height-coverage`
**Title:** Height Coverage — 建物の高さ入力状況を可視化する啓発サイト
**Description:** OSM上の建物ポリゴンのうち、高さ・階数（height / num_floors）が入力済みのものを緑、未入力のものを黄色で塗り分け（いずれもフラット表示。理由は[DECISIONS.md](DECISIONS.md)項目9参照）、「これだけの建物が高さ入力を待っている」ことを視覚的に伝える啓発サイト。世界中どこでも使える汎用ツールとして設計し、特定の地名をリポジトリ名に含めない。最初の適用対象はヴィエンチャン歴史地区（チャンタブリー郡）。

## 実装状況

MVPを`docs/`配下に実装済み（GitHub Pagesで配信、`main`ブランチの`docs/`フォルダをソースに設定）。技術的な詳細と使い方は[README.md](README.md)、判断の経緯は[DECISIONS.md](DECISIONS.md)、引き継ぎ事項は[HANDOVER.md](HANDOVER.md)を参照。

## このリポジトリの位置づけ

これは**汎用の可視化ツール**であり、特定の国・地域に紐づくものではない。最初の具体的な適用対象は、`hfu/vientiane-basemap-baseline`（プライベートリポジトリ）で進めているラオス・ヴィエンチャン地区の予備調査だが、**このリポジトリ自体は世界中のどのOSMデータにも適用できる汎用サイト**として構築する。dwg7名義の公開リポジトリとして問題ない性質のツールである（政治的機微を含む分析はhfu側に留め、こちらは技術的な可視化ツールに徹する）。

## 背景

JICAラオス案件（`hfu/vientiane-basemap-baseline`参照）において、ヴィエンチャン・チャンタブリー郡のチャオ・アヌウォン・スタジアム周辺地区（AOI）で、地区詳細計画のベース地図調達の選択肢としてOSM活用を提案している。予備調査の結果、**この地域のOSM建物データには高さ情報（height / building:levels）がほとんど入力されていない**ことが分かっている。この状況を、C/Pや大学関係者、あるいはOSMコミュニティ一般に向けて視覚的に訴えるためのサイトを作る。

目的を一言で言えば、「地図を作ることが目的なのではなく、地図を調達することが目的、もっと言えば計画を進めることが目的」という原則のもと、**高さ入力という具体的で分かりやすいタスクへの参加を促す**ための、シンプルな訴求ツールを作ること。

## サイト構成（2層構造）

1. **背景レイヤー**：タイルデータは`stars.optgeo.org`の`openstreetmap_jp_planet`（Planetiler + OpenMapTilesスキーマ）で、建物以外のすべて（道路・地名・水域等）をレンダリングする。スタイルは https://stars.optgeo.org/style/positron （OpenMapTiles公式Positronスタイルをstars.optgeo.org向けに調整したもの。白系・低彩度で建物の色分けを邪魔しない。海上境界は除外済み。経緯は[DECISIONS.md](DECISIONS.md)項目10、hfu/starsリポジトリの[PR #5](https://github.com/hfu/stars/pull/5)参照）を改造する。
2. **建物レイヤー**：`stars.optgeo.org/overture_buildings`（smellman/Taro Matsuzawa氏が構築したOverture Maps buildingsスキーマのタイル。旧`tunnel.optgeo.org/martin/buildings`と同一データセットで、現在はstars.optgeo.org側がsmellman氏の`dev.smellman.org`上のPMTilesを直接プロキシする形で配信。経緯は[DECISIONS.md](DECISIONS.md)項目9参照）で建物を描画する。ただし`sources`フィールドでOSM以外の出典を持つフィーチャーは無視する。緑／黄色（いずれもフラット表示）の判定もこのレイヤーのデータで行う。

## 重要な技術的発見（必読）

### stars.optgeo.orgの`building`レイヤーは使えない

`stars.optgeo.org/openstreetmap_jp_planet`の`building`レイヤーは`colour`, `hide_3d`, `render_height`, `render_min_height`という4フィールドを持つが、**これは高さ入力の有無を判別する用途には使えない**。

Planetiler（`planetiler-openmaptiles`）の`Building.java`の実装：

```java
int renderHeight = (int) Math.ceil(
  height != null ? height :
  levels != null ? (levels * 3.66) :
  5  // ← 高さ不明の建物にも一律5mの合成値が入る
);
```

つまり、`height`・`building:levels`どちらのタグも無い建物にも、描画上の配慮として一律5mの合成値が入ってしまう。**全建物に何らかの`render_height`が存在するため、「値があるかどうか」で入力済み／未入力を判定できない。** これは今回のプロジェクトの前提を覆す発見であり、他のOpenMapTiles系タイルセットを使う場合も同様の注意が必要。

### Shortbread（OSMF公式スキーマ）も使えない

OSMFが採用を進めているShortbread（`shortbread-tiles.org`）の`buildings`レイヤーは、公式スキーマ文書（v1.0）によれば、建物ポリゴンと`dummy`（常に`1`の数値、実質的に無意味な値）のみを持つ、意図的に簡素化されたレイヤー。高さ・階数関連のフィールドは一切ない。将来のバージョンで拡充される可能性はあるが、現時点では不採用。

### taroverture（Overture buildingsスキーマ）を採用

`tunnel.optgeo.org/martin/buildings`（初期実装時点。現在は`stars.optgeo.org/overture_buildings`で配信、詳細は[DECISIONS.md](DECISIONS.md)項目9参照）は、Overture Maps Foundationの建物スキーマをベースにしたタイルで、Taro M.（smellman）氏が構築したもの（愛称「taroverture」＝tar + Overtureの言葉遊びと思われる）。以下のフィールドを持つ。

**buildingレイヤー：**
```
@geometry_source, @height_source, @name, class, facade_color, facade_material,
has_parts, height, id, is_underground, level, min_floor, min_height, names,
num_floors, num_floors_underground, roof_color, roof_direction, roof_height,
roof_material, roof_orientation, roof_shape, sources, subtype, version
```

**building_partレイヤー：** buildingとほぼ同じフィールド構成（`building_id`で親buildingと紐付け）。

**このスキーマが決定的に優れている理由：**
- `height`と`num_floors`が独立したフィールドとして存在し、Planetilerのような合成値の混入がない（実データで確認済み。下記「フェーズ0の検証結果」参照）。
- `@height_source`という出典追跡フィールドを持つ。これにより「この高さの値がどこから来たか」を判別できる可能性がある。
- `@geometry_source`もあり、建物の輪郭自体の出典も追える。

**注意点：** OvertureはOSMだけでなく、Microsoft・GoogleのAI建物フットプリント検出データなど複数のソースを統合（fuse）している。そのため`sources`フィールドの値がOSM以外のケースが混在している可能性が高い。**啓発サイトの趣旨（OSMコミュニティへの入力呼びかけ）に照らすと、`sources`（または`@height_source`）でOSM由来のもの以外は明示的に除外する必要がある。**

## フェーズ0の検証結果（確認済み）

z=14タイルをヴィエンチャン（12861/7360）・パリ中心部（8299/5636）・ロンドン中心部（8186/5448）の3地域で取得・デコードして確認した（taroverture自体のmaxzoomが14であり、CLAUDE.md初版が指定したz=16は存在しないため、z=14相当に読み替えて検証した）。詳細な調査過程と数値は[DECISIONS.md](DECISIONS.md)を参照。

**確定した事実：**

1. **`@height_source`は`height`フィールド専用の出典追跡フィールドであり、`num_floors`の出典は追跡しない。** 値は`"OpenStreetMap"` / `"Microsoft ML Buildings"` / `null`のいずれか。`height`が存在しない（`num_floors`のみ、または両方とも無い）フィーチャーでは常に`null`になる。
2. **`num_floors`には専用の出典フィールドが無い。** 実データでは、サンプルした全地域・全フィーチャーにおいて`num_floors`が存在する場合は例外なく`sources`に`provider:"osm"`が含まれていた（Microsoft/GoogleのAI建物フットプリント検出は階数情報を持たない）。
3. **`sources`フィールドはJSON配列の文字列**で、各要素が`{"provider": "osm"|"microsoft"|"google", ...}`という形式。ヴィエンチャンでは単一プロバイダのみだったが、パリ・ロンドンでは`microsoft`と`osm`が融合（フットプリントはMicrosoft AI検出、しかし高さはOSM由来）した複数プロバイダのフィーチャーが多数存在した。この融合パターンは地域によって出現有無が異なるため、**判定は`sources`の文字列一致だけに頼らず、`@height_source`（heightがある場合）と組み合わせる必要がある。**
4. taroverture利用可能地域では、高さ・階数入力率はヴィエンチャンAOIで約0.2%、パリ中心部で約63%、ロンドン中心部で約41%（`building`レイヤー、`building_part`除く）と、地域差が非常に大きいことも確認できた。この対比自体が啓発材料として有効。

## 判定・配色ロジック（確定・実装済み）

3階調で表示する（[docs/app.js](docs/app.js)に実装）：

- **緑（フラット表示）**：以下のいずれかを満たす建物。
  - `height`が存在し、かつ`@height_source == "OpenStreetMap"`
  - `height`が無いが`num_floors`が存在し、かつ`sources`に`provider:"osm"`を含む
- **黄色（フラット表示）**：`sources`に`provider:"osm"`を含む（＝OSM上に建物自体は存在する）が、上記の緑条件を満たさない建物。「入力を待っている」啓発メッセージの主対象。
- **極薄いグレー（フラット・低不透明度）**：`sources`に`osm`が一切含まれない建物（Microsoft/GoogleのAI検出フットプリントのみ）。OSMへの入力呼びかけの対象ではないが、「そこに建物があること自体」を背景参考情報として薄く示す（ユーザー要望により追加、[DECISIONS.md](DECISIONS.md)参照）。
- 3色すべてフラット表示（`fill-extrusion`不使用）。理由は[DECISIONS.md](DECISIONS.md)項目9の追記を参照（globe投影とfill-extrusionレイヤーの組み合わせで`queryRenderedFeatures`のビューポート全体クエリが機能しないバグを実機で確認したため）。
- 画面内（ビューポート限定、バックエンド集計なし）で緑／黄色の件数と、そのうち階数入力 vs 高さ(m)入力の内訳をUIに表示する。「階数入力の方がフィールド調査で現実的」という仮説を検証するための内訳表示。

### なぜ`height`と`num_floors`で判定方法が違うのか

taroverture（Overtureスキーマ）には`@height_source`という出典追跡フィールドが1つしか無く、これは**`height`フィールド専用**で、値は`"OpenStreetMap"` / `"Microsoft ML Buildings"` / `null`のいずれか（`height`が無ければ常に`null`）。`num_floors`専用の出典フィールドは存在しない。そのため：

- `height`があるとき → `@height_source`を直接見て判定できる（確実）。**`height`はOSM以外からも実際に供給される** — パリのサンプルタイルでは、`height`はあるが出典が`Microsoft ML Buildings`のみ（`sources`に`osm`を含まない）という建物が20件観測された。つまりMicrosoftのAI建物検出モデルは輪郭だけでなく高さの推定値も出力しており、`height`が存在すること自体はOSM由来の証拠にならない。だからこそ`@height_source`での確認が必須。
- `num_floors`しか無いとき → 専用フィールドが無いので、`sources`（建物ジオメトリ全体の出典リスト）に`provider:"osm"`が含まれるかで代用する。これは「Vientiane・パリ・ロンドンでサンプルした全フィーチャーで、`num_floors`を持つものは例外なくOSM由来だった（Microsoft ML Buildings・Google Open Buildingsのどちらも階数までは推定していない）」という実データ観察に基づく代用であり、スキーマ上の保証ではない（[DECISIONS.md](DECISIONS.md)項目4参照）。

**`@geometry_source`（建物の輪郭＝ジオメトリの出典）は高さ・階数の判定には一切使っていない。** 名前が`@height_source`と似ているため混同しやすいが、別物。輪郭がAI検出（Microsoft/Google）由来でも、高さだけがOSM由来というケース（`sources`に`microsoft`と`osm`が両方入る）が実際にパリ・ロンドンで多数観測されており、これが`@geometry_source`ではなく`@height_source`／`sources`の`provider`を見るべき理由でもある。

## UI / 技術スタック

- MapLibre GL JS 6.6.0（CDN配信のESモジュール。v6でUMDバンドルが廃止されたため、`docs/app.js`は`<script type="module">`として読み込み、`import * as maplibregl from ".../maplibre-gl.mjs"`で参照する）。
- `globe`投影（`style.projection = {type: "globe"}`）。世界中どこでも使える汎用ツールであることを示す意図。ズーム5前後で自動的にフラットなmercatorへフェードする。
- URLハッシュは`hash: "map"`設定により`#map=z/lat/lng/bearing/pitch`の形式（他の用途と衝突しないよう名前空間化）。
- 左上パネル（凡例・統計）はヘッダークリックで折りたたみ可能。
- 左下に、カーソルが乗っている建物の生の属性（`num_floors`・`height`・`@height_source`。ただし`@height_source`は`"OpenStreetMap"`以外の場合のみ表示）を出す小さなパネルがあり、分類ロジックの裏付けをその場で確認できる。

## インフラ変更履歴（解決済み・要参照）

初期実装では建物レイヤーに`tunnel.optgeo.org/martin/buildings`（hfu氏個人のCloudflare Tunnel経由）を使っていたが、GitHub Pages公開後にそのマシンがネットワーク切り替えの影響でダウンし、実ブラウザからCORSエラーで建物が読み込めなくなった（原因の切り分け過程で2回誤診断している。詳細は[DECISIONS.md](DECISIONS.md)項目8）。

調査の結果、このOverture buildingsデータセットは元々smellman（Taro Matsuzawa）氏が構築したもので、`tunnel.optgeo.org`はそれを単に個人トンネル経由でプロキシしていただけと判明。smellman氏本人が`https://dev.smellman.org/static/overture-latest/`にPMTiles形式（`buildings.pmtiles`ほか）で直接公開していることを発見し、stars.optgeo.orgの運用エージェントに依頼して、Martinの`pmtiles.sources`機構（`bvmap`や`openstreetmap_jp_planet`と同じ仕組み、リモートファイルへのrangeリクエストによるプロキシでローカルコピー不要）でこれをプロキシしてもらった。現在は`stars.optgeo.org/overture_buildings`を建物レイヤーとして使用している（スキーマ・データは`tunnel.optgeo.org`時代と完全に同一であることを`planetiler:githash`と実タイルのデコード結果で確認済み）。経緯の全記録は[DECISIONS.md](DECISIONS.md)項目9、対応状況は[HANDOVER.md](HANDOVER.md)を参照。

## スコープ

- 対象：世界中のOSM建物データ全般に適用可能な汎用サイト。特定地域の啓発だけでなく、OSMコミュニティ全体への訴求ツールとしても機能させる。
- 最初の検証地域：ヴィエンチャン・チャンタブリー郡（AOI）。ただし実装は特定地域にハードコードしない。
- スタイルの改造元：https://stars.optgeo.org/style/positron

## やらないこと（非目標）

- 高さ・階数の属性値そのものをこのサイトから編集・入力する機能（あくまで「見せる」啓発サイトであり、編集機能は範囲外。編集はiD/JOSM等の既存エディタに委ねる）。
- OSM以外の出典（Microsoft/Google等のAI建物フットプリント）を「入力済み」として緑扱いすること。
- 特定地域名をリポジトリ名・コード内の主要な識別子に固定すること。

## 参考リンク

- 背景レイヤー（TileJSON）：https://stars.optgeo.org/openstreetmap_jp_planet
- 背景レイヤー（スタイル、Positron）：https://stars.optgeo.org/style/positron
- 背景スタイルのPR：https://github.com/hfu/stars/pull/5
- 建物レイヤー（TileJSON、現行）：https://stars.optgeo.org/overture_buildings
- 建物レイヤー「taroverture」の元データ出典（smellman氏のPMTiles直配信）：https://dev.smellman.org/static/overture-latest/buildings.pmtiles（旧`tunnel.optgeo.org/martin/buildings`は個人トンネルのダウンにより現在は不使用。経緯は[DECISIONS.md](DECISIONS.md)項目8・9参照）
- Planetiler `Building.java`（render_heightの合成ロジック）：https://github.com/openmaptiles/planetiler-openmaptiles/blob/main/src/main/java/org/openmaptiles/layers/Building.java
- Shortbread schema 1.0（buildingsレイヤーが`dummy`のみである根拠）：https://shortbread-tiles.org/schema/1.0/
- Overture Maps Foundation：https://docs.overturemaps.org/
- 関連リポジトリ（同じJICAラオス案件の予備調査、プライベート）：`hfu/vientiane-basemap-baseline`
- 既存関連リポジトリ：`dwg7/spiccato`、`optgeo/cogenerate`、`hfu.github.io/layers-martin`
