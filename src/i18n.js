const LANGUAGE_STORAGE_KEY = 'oicmap:lang';
export const LANGUAGE_CHANGE_EVENT = 'oicmap:languagechange';

const dictionaries = {
  ja: {
    "food.find": "食事場所を探す",
    "food.title": "食事",
    "food.close": "食事案内を閉じる",
    "food.loading": "食事場所を読み込んでいます…",
    "food.loadError": "食事場所を読み込めませんでした。",
    "food.retry": "再読み込み",
    "food.nearby": "この付近の食事場所",
    "food.listTitle": "店舗一覧",
    "food.group": "食事場所{count}件を表示",
    "food.pin": "{name}、{building}1階。詳細を開く",
    "food.details": "詳しく見る",
    "food.viewOnMap": "地図で見る",
    "food.collapse": "概要に戻る",
    "food.backList": "一覧に戻る",
    "food.all": "すべての食事場所",
    "food.hours": "営業時間",
    "food.usage": "利用案内",
    "food.link.menu": "メニュー",
    "food.link.hours": "営業時間を確認",
    "food.link.official": "公式サイト",
    "food.external": "（新しいタブで開く）",
    "food.hoursLoading": "営業時間を確認中…",
    "food.hoursUnknown": "公式の営業時間をご確認ください。",
    "food.status.within": "営業時間内",
    "food.status.outside": "営業時間外",
    "food.status.unknown": "営業状況を確認できません",
    "food.closedDay": "休業",
    "food.allDay": "24時間",
    "food.coopSource": "生協の営業カレンダー",
    "food.temporary": "臨時",
    "food.regular": "通常",
    "food.usage.eatIn": "店内飲食",
    "food.usage.takeaway": "持ち帰り",
    "food.usage.outsideFood": "購入品以外の持ち込み",
    "food.usage.publicAccess": "一般の方の利用",
    "food.value.yes": "可",
    "food.value.no": "不可",
    "food.value.unknown": "未確認",
    "food.period.弁当・ドリンク販売": "弁当・ドリンク販売",
    "food.period.クレープ・ドリンク販売": "クレープ・ドリンク販売",
    "food.trucks": "本日のキッチンカー",
    "food.trucks.loading": "読み込み中…",
    "food.trucks.error": "キッチンカー情報を取得できませんでした。",
    "food.trucks.none": "出店なし",
    "food.trucks.outOfPeriod": "営業カレンダーの期間外です。最新の出店予定は公式の案内をご確認ください。",

    'meta.appName': '立命館OICマップ',
    'meta.title.viewer': '立命館OICマップ | 教室・施設を検索',
    'meta.title.editor': '立命館OICマップ 編集用',
    'meta.title.login': '編集ページログイン',
    'meta.description':
      '立命館大学大阪いばらきキャンパス(OIC)の非公式キャンパスマップ。500以上の教室検索とトイレ・エレベーター・プリンターなどの施設位置を確認できます。',
    'meta.schemaAlternateName': 'Ritsumeikan OIC Map',

    'lang.switchToEnglish': '英語に切り替え',
    'lang.switchToJapanese': '日本語に切り替え',
    'lang.toggle': '言語を切り替え',

    'menu.open': 'メニューを開く',
    'menu.close': 'メニューを閉じる',
    'menu.label': 'メニュー',
    'menu.siteNav': 'サイトメニュー',
    'menu.map': 'マップ',
    'menu.about': 'このサイトについて',
    'menu.access': 'アクセス',
    'menu.timetable': '時刻表',
    'menu.food': 'OICフード',
    'menu.contactForm': 'お問い合わせ',

    'about.title': 'このサイトについて',
    'about.close': '説明を閉じる',
    'about.intro':
      '立命館OICマップは、立命館大学大阪いばらきキャンパス(OIC)の教室・施設をすばやく探せる非公式キャンパスマップです。OICのフロアマップを切り替えながら、目的の場所を確認できます。',
    'about.rooms':
      '教室検索では、500以上の教室、研究室、ラウンジ、ホール、学生利用スペースを検索し、1Fから5F、A棟6〜9F、H棟6〜9Fの地図上で位置を確認できます。',
    'about.facilities':
      'トイレ、エレベーター、階段、エスカレーター、プリンター、自販機、ウォーターサーバーなど、キャンパス内でよく探される施設の場所も確認できます。',
    'contactForm.title': 'お問い合わせ',
    'contactForm.close': 'フォームを閉じる',
    'contactForm.iframeTitle': 'お問い合わせ',
    'contactForm.unconfigured': 'フォームURLがまだ設定されていません。Google Forms の埋め込みURLを設定してください。',

    'app.title.viewer': '立命館OICマップ',
    'app.title.short': 'OICマップ',
    'app.title.editor': '立命館OICマップ 編集用',

    'fileMode.viewer.title': '立命館OICマップ',
    'fileMode.viewer.copy1':
      'このアプリは <strong>index.html を直接開く方式では動作しません</strong>。地図表示と操作機能はローカルサーバー経由で起動する必要があります。',
    'fileMode.viewer.copy2':
      '一番簡単なのは、プロジェクト直下の <code>start-map.command</code> をダブルクリックする方法です。',
    'fileMode.viewer.copy3':
      'ターミナルを使う場合は <code>npm run dev</code> のあと、<code>http://127.0.0.1:5173/</code> を開いてください。',
    'fileMode.editor.title': '立命館OICマップ 編集用',
    'fileMode.editor.copy1':
      'このアプリは <strong>index.html を直接開く方式では動作しません</strong>。地図表示と編集機能はローカルサーバー経由で起動する必要があります。',
    'fileMode.editor.copy2':
      'ターミナルで <code>npm run dev</code> を実行して、<code>http://127.0.0.1:5173/editor/</code> を開いてください。',
    'fileMode.editor.copy3': '閲覧用サイトは <code>http://127.0.0.1:5173/</code> です。',
    'fileMode.login.title': '編集ページログイン',
    'fileMode.login.copy':
      'このログイン画面はローカルサーバー経由で開く必要があります。<code>npm run dev</code> のあと <code>http://127.0.0.1:5173/editor/login/</code> を開いてください。',

    'search.placeholder': '教室名を検索',
    'search.clear': '検索をクリア',
    'search.facilityActions': '施設アイコン',
    'search.feedback.default': '',
    'search.feedback.loading': '検索データを読み込み中...',
    'search.feedback.loadError': '検索データを読み込めませんでした。通信状況を確認して再試行してください。',
    'search.retry': '再試行',
    'search.feedback.noData': '検索データがまだありません',
    'search.feedback.noDataRegistered': '検索データがまだ登録されていません',
    'search.feedback.noDataShort': '検索データなし',
    'search.feedback.noMatches': '一致する教室候補がありません',
    'search.feedback.noMatchesShort': '一致候補なし',
    'search.feedback.inputHint': 'アルファベットと数字で検索できます',
    'search.feedback.inputRequired': '検索語を入力してください',
    'search.feedback.showing': '{label} を {floor} で表示中',
    'search.feedback.matches': '{count} 件の候補',
    'search.toiletLegend': '青色は男子トイレ、赤色は女子トイレ、黄色は多目的トイレです',
    'legend.toilet': 'トイレの色分け',
    'legend.toiletMen': '男性',
    'legend.toiletWomen': '女性',
    'legend.toiletAccessible': '多目的',

    'quickActions.label': 'クイックリンク',
    'quickActions.food': 'OICフード',
    'quickActions.timetable': '時刻表',

    'facility.toilet': 'トイレ',
    'facility.waterServer': 'ウォーターサーバー',
    'facility.vendingMachine': '自販機',
    'facility.printer': 'プリンター',
    'facility.stairs': '階段',
    'facility.stairsAndEscalators': '階段・エスカレーター',
    'facility.escalator': 'エスカレーター',
    'facility.elevator': 'エレベーター',
    'facility.more': 'その他',
    'facility.moreHeading': 'その他の施設',
    'facility.moreSelected': 'その他：{label}',
    'facility.aed': 'AED',
    'facility.nursingRoom': '授乳スペース',
    'facility.atm': 'ATM',

    'floor.1F': '1F',
    'floor.2F': '2F',
    'floor.3F': '3F',
    'floor.4F': '4F',
    'floor.5F': '5F',
    'floor.A-6-9F': 'A棟 6–9F',
    'floor.A-6-9F.place': 'A棟',
    'floor.A-6-9F.level': '6–9F',
    'floor.H-6-9F': 'H棟 6–9F',
    'floor.H-6-9F.place': 'H棟',
    'floor.H-6-9F.level': '6–9F',
    'floor.printerMap': 'プリンター',
    'floor.selected': '選択中の',
    'floor.floor': 'フロア',
    'floor.primaryNav': 'フロア切替',
    'floor.secondaryNav': '棟別フロア切替',
    'floor.dropdownOpen': '現在のフロアは {floor}。フロアリストを開く',
    'floor.dropdownClose': '現在のフロアは {floor}。フロアリストを閉じる',
    'floor.map': 'フロアマップ',
    'status.loading': '読み込み中...',
    'status.floorLoading': '{floor} を読み込み中...',
    'status.floorError': '地図の読み込みに失敗しました',
    'status.ringsError': '{facility}の位置情報を読み込めませんでした。',
    'status.retryMap': '地図を再読み込み',
    'status.retryRings': '位置情報を再読み込み',

    'editor.logout': 'ログアウト',
    'editor.caption': '編集用URLです。地図をクリックして検索用テキストと位置を記録できます。',
    'editor.shellAria': '検索データ編集',
    'editor.noCoords': '位置未指定',
    'editor.field.displayName': '表示名',
    'editor.placeholder.displayName': '例: OIC Shop',
    'editor.action.save': 'この位置を記録',
    'editor.action.clearPoint': '位置をクリア',
    'editor.action.copy': 'JSONをコピー',
    'editor.action.export': 'JSONを保存',
    'editor.action.import': 'JSONを読み込み',
    'editor.action.publish': '編集を確定',
    'editor.ringTools': '蛍光リング編集',
    'editor.ringSettings': '蛍光リング設定',
    'editor.ringTarget': 'リング対象',
    'editor.ringColor': 'トイレリング色',
    'editor.ringClear': '選択中施設の現在階リングをクリア',
    'editor.areaTools': '施設領域編集',
    'editor.areaSettings': '施設領域設定',
    'editor.areaTarget': '対象施設',
    'editor.areaSelectPlaceholder': '施設を選択',
    'editor.areaNew': '新しい領域を描く',
    'editor.areaSave': '領域を確定',
    'editor.areaUndo': '最後の頂点を戻す',
    'editor.areaCancel': 'キャンセル',
    'editor.areaHelp': '施設を選んで「新しい領域を描く」を押し、地図上を外周に沿って順番にクリックしてください。',
    'editor.areaNoEntries': '{floor} に選択できる施設がありません',
    'editor.areaNoAreas': '{floor} に登録済みの施設領域はありません',
    'editor.areaLabel': '{label} 領域 {index}',
    'editor.areaMeta': '{count}頂点',
    'editor.areaEdit': '編集',
    'editor.areaSelectRequired': '先に対象施設を選択してください',
    'editor.areaDrawingStarted': '{label} の新しい領域を描画します。外周の頂点を順番にクリックしてください',
    'editor.areaEditingStarted': '{label} の領域を編集中です。地図クリックで頂点追加、丸いハンドルのドラッグで位置調整できます',
    'editor.areaVertexAdded': '{label}: {count}個目の頂点を追加しました',
    'editor.areaMinimumVertices': '領域の確定には3個以上の頂点が必要です',
    'editor.areaSaved': '{label} の領域を保存しました',
    'editor.areaCanceled': '施設領域の編集をキャンセルしました',
    'editor.areaDeleted': '{label} の領域を削除しました',
    'editor.areaUndoDone': '最後の頂点を戻しました。現在{count}頂点です',
    'editor.areaVertexMoved': '{label} の頂点位置を調整しました',
    'editor.areaHoverAria': '{label} の施設領域',
    'editor.feedback.default':
      '地図上の文字位置をクリックして表示名を記録できます。蛍光リング設定ボタンをオンにすると、地図タップで対応リングを設置または削除できます',
    'editor.jsonAria': '書き出し用JSON',
    'editor.move': '移動',
    'editor.delete': '削除',
    'editor.alias': '別名',
    'editor.rectMeta': '{count} rect{aliases}',
    'editor.aliasMeta': ' / 別名: {aliases}',
    'editor.noRingTool': '施設ボタンをオンにすると、その施設用のリングを追加・削除できます',
    'editor.noRings': '{floor} の {facility} リングはまだありません',
    'editor.ringLabel': '{facility} リング {index}',
    'editor.ringLabelWithColor': '{facility}({color}) リング {index}',
    'editor.ringHandleAria': '{facility} のリングを操作',
    'editor.ringHandleAriaWithColor': '{facility} {color}リングを操作',
    'editor.pinAria': '{label} を確認',
    'editor.noEntries': '{floor} の手入力データはまだありません',
    'editor.mode.on':
      '地図上の文字位置をクリックして表示名を記録できます。リング編集ボタンがオンの時はリングを追加・削除できます',
    'editor.mode.off': '編集モードをオンにして、地図上の文字位置をクリックしてください',
    'editor.ringModeToilet': 'トイレリング編集モードです。現在色: {color}',
    'editor.ringModeFacility':
      '{facility} のリング編集モードです。地図をタップすると追加、既存リングをタップすると削除します',
    'editor.ringModeOff': '地図上の文字位置をクリックして表示名を記録できます。リング編集モードはオフです',
    'editor.ringRecordFailed': 'リング位置を記録できませんでした',
    'editor.ringAdded': '{floor} に {facility} リングを追加しました',
    'editor.ringAddedWithColor': '{floor} に {facility}({color}) リングを追加しました',
    'editor.ringRemoved': '{floor} の {facility} リングを削除しました',
    'editor.ringRemovedWithColor': '{floor} の {facility}({color}) リングを削除しました',
    'editor.ringsCleared': '{floor} の {facility} リングを {count} 件クリアしました',
    'editor.ringSelected': '{floor} / {facility} リング',
    'editor.ringSelectedWithColor': '{floor} / {facility}({color}) リング',
    'editor.ringMoved': '{floor} / {facility} リングへ移動しました',
    'editor.ringMovedWithColor': '{floor} / {facility}({color}) リングへ移動しました',
    'editor.labelRequired': '表示名を入力してください',
    'editor.pointRequired': '先に地図上をクリックして位置を指定してください',
    'editor.entryCreateFailed': '入力値から検索データを作成できませんでした',
    'editor.entrySaved': '{label} を {floor} に記録しました',
    'editor.copied': 'JSON をクリップボードにコピーしました',
    'editor.copyFailed': '自動コピーに失敗したため、JSON を選択した状態にしました',
    'editor.exported': '{filename} を保存しました',
    'editor.imported':
      '{entries} 件の検索データと {rings} 件のリング下書きを読み込みました。「編集を確定」で閲覧用に反映されます',
    'editor.importedEmpty': '空の JSON を読み込みました。「編集を確定」で閲覧用からも削除されます',
    'editor.importFailed': 'JSON の読み込みに失敗しました',
    'editor.published': '{entries} 件の検索データと {rings} 件のリングを閲覧用サイトに反映しました',
    'editor.publishedEmpty': '閲覧用サイトの検索データとリングを空に反映しました',
    'editor.specialFloorEditDisabled': 'プリンター表示中は通常フロアの位置編集を無効にしています',
    'editor.outsideMap': '地図の外側は記録できません',
    'editor.pointCaptured': '位置を取得しました。表示名を入れて「この位置を記録」を押してください',
    'editor.pointCleared': '仮位置をクリアしました',

    'color.red': '赤',
    'color.blue': '青',
    'color.yellow': '黄',

    'login.aria': '編集ページログイン',
    'login.title': '編集ページにログイン',
    'login.password': 'パスワード',
    'login.submit': 'ログイン',
    'login.back': '閲覧用サイトへ戻る',
    'login.error.incorrect': 'パスワードが違います。',

    'footer.legalNav': '法務リンク',
    'footer.siteInfo': 'サイト情報',
    'footer.terms': '利用規約',
    'footer.privacy': 'プライバシーポリシー',
    'footer.sources': '情報源・権利',
    'footer.creator': '制作者について',
    'footer.copyrightSimple': '© 2026 Issei Yasuda'
  },
  en: {
    "food.find": "Find food",
    "food.title": "Food",
    "food.close": "Close food guide",
    "food.loading": "Loading food places…",
    "food.loadError": "Food places could not be loaded.",
    "food.retry": "Try again",
    "food.nearby": "Food places nearby",
    "food.listTitle": "Shop List",
    "food.group": "Show {count} food places",
    "food.pin": "{name}, {building}, 1F. Open details",
    "food.details": "View details",
    "food.viewOnMap": "View on map",
    "food.collapse": "Show summary",
    "food.backList": "Back to list",
    "food.all": "All food places",
    "food.hours": "Hours",
    "food.usage": "Visitor information",
    "food.link.menu": "Menu",
    "food.link.hours": "Check hours",
    "food.link.official": "Official website",
    "food.external": "(opens in a new tab)",
    "food.hoursLoading": "Checking hours…",
    "food.hoursUnknown": "Please check the official hours.",
    "food.status.within": "Within opening hours",
    "food.status.outside": "Outside opening hours",
    "food.status.unknown": "Opening status unavailable",
    "food.closedDay": "Closed",
    "food.allDay": "24 hours",
    "food.coopSource": "Co-op calendar",
    "food.temporary": "Temporary",
    "food.regular": "Regular",
    "food.usage.eatIn": "Eat in",
    "food.usage.takeaway": "Takeaway",
    "food.usage.outsideFood": "Bring outside food",
    "food.usage.publicAccess": "Public access",
    "food.value.yes": "Yes",
    "food.value.no": "Not available",
    "food.value.unknown": "Unconfirmed",
    "food.period.弁当・ドリンク販売": "Bento & drinks",
    "food.period.クレープ・ドリンク販売": "Crepes & drinks",
    "food.trucks": "Today's food trucks",
    "food.trucks.loading": "Loading…",
    "food.trucks.error": "Could not load today's food trucks.",
    "food.trucks.none": "None today",
    "food.trucks.outOfPeriod": "Today is outside the published schedule. Please check the official announcement.",

    'meta.appName': 'Ritsumeikan OIC Map',
    'meta.title.viewer': 'Ritsumeikan OIC Map',
    'meta.title.editor': 'Ritsumeikan OIC Map Editor',
    'meta.title.login': 'Editor Login',
    'meta.description':
      "Unofficial campus map for Ritsumeikan University's Osaka Ibaraki Campus (OIC). Search 500+ rooms and find restrooms, elevators, printers, and other facilities.",
    'meta.schemaAlternateName': '立命館OICマップ',

    'lang.switchToEnglish': 'Switch to English',
    'lang.switchToJapanese': 'Switch to Japanese',
    'lang.toggle': 'Switch language',

    'menu.open': 'Open menu',
    'menu.close': 'Close menu',
    'menu.label': 'Menu',
    'menu.siteNav': 'Site menu',
    'menu.map': 'Map',
    'menu.about': 'About this map',
    'menu.access': 'Access',
    'menu.timetable': 'Timetable',
    'menu.food': 'OIC Food',
    'menu.contactForm': 'Contact',

    'about.title': 'About this map',
    'about.close': 'Close description',
    'about.intro':
      "Ritsumeikan OIC Map is an unofficial campus map for quickly finding rooms and facilities at Ritsumeikan University's Osaka Ibaraki Campus (OIC). Switch between OIC floor maps to check where you need to go.",
    'about.rooms':
      'The room search covers 500+ classrooms, labs, lounges, halls, and student spaces across 1F to 5F, Building A 6F-9F, and Building H 6F-9F.',
    'about.facilities':
      'You can also find frequently searched campus facilities, including restrooms, elevators, stairs, escalators, printers, vending machines, and water dispensers.',
    'contactForm.title': 'Contact',
    'contactForm.close': 'Close form',
    'contactForm.iframeTitle': 'Contact',
    'contactForm.unconfigured': 'The form URL is not configured yet. Set the Google Forms embed URL to enable this form.',

    'app.title.viewer': 'Ritsumeikan OIC Map',
    'app.title.short': 'OIC Map',
    'app.title.editor': 'Ritsumeikan OIC Map Editor',

    'fileMode.viewer.title': 'Ritsumeikan OIC Map',
    'fileMode.viewer.copy1':
      'This app does <strong>not work when you open <code>index.html</code> directly</strong>. The map and its controls must be launched through a local server.',
    'fileMode.viewer.copy2':
      'The easiest option is to double-click <code>start-map.command</code> in the project root.',
    'fileMode.viewer.copy3':
      'If you prefer the terminal, run <code>npm run dev</code> and then open <code>http://127.0.0.1:5173/</code>.',
    'fileMode.editor.title': 'Ritsumeikan OIC Map Editor',
    'fileMode.editor.copy1':
      'This app does <strong>not work when you open <code>index.html</code> directly</strong>. The map and editor must be launched through a local server.',
    'fileMode.editor.copy2':
      'Run <code>npm run dev</code> in Terminal, then open <code>http://127.0.0.1:5173/editor/</code>.',
    'fileMode.editor.copy3': 'The viewer site is <code>http://127.0.0.1:5173/</code>.',
    'fileMode.login.title': 'Editor Login',
    'fileMode.login.copy':
      'This login page must be opened through a local server. After running <code>npm run dev</code>, open <code>http://127.0.0.1:5173/editor/login/</code>.',

    'search.placeholder': 'Search rooms',
    'search.clear': 'Clear search',
    'search.facilityActions': 'Facility filters',
    'search.feedback.default': '',
    'search.feedback.loading': 'Loading search data...',
    'search.feedback.loadError': 'Search data could not be loaded. Check your connection and try again.',
    'search.retry': 'Try again',
    'search.feedback.noData': 'No search data is available yet.',
    'search.feedback.noDataRegistered': 'No search data is registered yet.',
    'search.feedback.noDataShort': 'No search data',
    'search.feedback.noMatches': 'No matching rooms or facilities.',
    'search.feedback.noMatchesShort': 'No matches',
    'search.feedback.inputHint': 'Search using letters and numbers.',
    'search.feedback.inputRequired': 'Enter a search term.',
    'search.feedback.showing': 'Showing {label} on {floor}',
    'search.feedback.matches': '{count} match{suffix}',
    'search.toiletLegend':
      "Blue rings mark men's restrooms, red rings mark women's restrooms, and yellow rings mark accessible restrooms.",
    'legend.toilet': 'Restroom colors',
    'legend.toiletMen': 'Men',
    'legend.toiletWomen': 'Women',
    'legend.toiletAccessible': 'Accessible',

    'quickActions.label': 'Quick links',
    'quickActions.food': 'OIC Food',
    'quickActions.timetable': 'Timetable',

    'facility.toilet': 'Restroom',
    'facility.waterServer': 'Water Dispenser',
    'facility.vendingMachine': 'Vending Machine',
    'facility.printer': 'Printer',
    'facility.stairs': 'Staircase',
    'facility.stairsAndEscalators': 'Stairs & Escalators',
    'facility.escalator': 'Escalator',
    'facility.elevator': 'Elevator',
    'facility.more': 'More',
    'facility.moreHeading': 'More facilities',
    'facility.moreSelected': 'More: {label}',
    'facility.aed': 'AED',
    'facility.nursingRoom': 'Nursing Space',
    'facility.atm': 'ATM',

    'floor.1F': '1F',
    'floor.2F': '2F',
    'floor.3F': '3F',
    'floor.4F': '4F',
    'floor.5F': '5F',
    'floor.A-6-9F': 'Bldg. A 6F–9F',
    'floor.A-6-9F.place': 'Bldg. A',
    'floor.A-6-9F.level': '6F–9F',
    'floor.H-6-9F': 'Bldg. H 6F–9F',
    'floor.H-6-9F.place': 'Bldg. H',
    'floor.H-6-9F.level': '6F–9F',
    'floor.printerMap': 'Printer Map',
    'floor.selected': 'Selected',
    'floor.floor': 'Floor',
    'floor.primaryNav': 'Floor selector',
    'floor.secondaryNav': 'Upper-floor building selector',
    'floor.dropdownOpen': 'Current floor is {floor}. Open the floor list',
    'floor.dropdownClose': 'Current floor is {floor}. Close the floor list',
    'floor.map': 'Floor map',
    'status.loading': 'Loading...',
    'status.floorLoading': 'Loading {floor}...',
    'status.floorError': 'Failed to load the map.',
    'status.ringsError': 'Could not load locations for {facility}.',
    'status.retryMap': 'Reload map',
    'status.retryRings': 'Reload locations',

    'editor.logout': 'Log Out',
    'editor.caption': 'This is the editor URL. Click the map to record searchable labels and their positions.',
    'editor.shellAria': 'Search data editor',
    'editor.noCoords': 'No location selected',
    'editor.field.displayName': 'Display Name',
    'editor.placeholder.displayName': 'Example: OIC Shop',
    'editor.action.save': 'Save This Location',
    'editor.action.clearPoint': 'Clear Location',
    'editor.action.copy': 'Copy JSON',
    'editor.action.export': 'Export JSON',
    'editor.action.import': 'Import JSON',
    'editor.action.publish': 'Publish Changes',
    'editor.ringTools': 'Highlight ring editor',
    'editor.ringSettings': 'Highlight Ring Settings',
    'editor.ringTarget': 'Ring type',
    'editor.ringColor': 'Restroom ring color',
    'editor.ringClear': 'Clear Rings for the Selected Facility on This Floor',
    'editor.areaTools': 'Facility area editor',
    'editor.areaSettings': 'Facility Area Settings',
    'editor.areaTarget': 'Facility',
    'editor.areaSelectPlaceholder': 'Select a facility',
    'editor.areaNew': 'Draw New Area',
    'editor.areaSave': 'Save Area',
    'editor.areaUndo': 'Undo Last Vertex',
    'editor.areaCancel': 'Cancel',
    'editor.areaHelp': 'Select a facility, choose “Draw New Area,” then click the map around its perimeter in order.',
    'editor.areaNoEntries': 'There are no selectable facilities on {floor}.',
    'editor.areaNoAreas': 'There are no saved facility areas on {floor}.',
    'editor.areaLabel': '{label} Area {index}',
    'editor.areaMeta': '{count} vertices',
    'editor.areaEdit': 'Edit',
    'editor.areaSelectRequired': 'Select a facility first.',
    'editor.areaDrawingStarted': 'Drawing a new area for {label}. Click each perimeter vertex in order.',
    'editor.areaEditingStarted': 'Editing the {label} area. Click the map to add vertices, or drag a round handle to reposition one.',
    'editor.areaVertexAdded': '{label}: added vertex {count}.',
    'editor.areaMinimumVertices': 'An area needs at least three vertices before it can be saved.',
    'editor.areaSaved': 'Saved the area for {label}.',
    'editor.areaCanceled': 'Canceled facility area editing.',
    'editor.areaDeleted': 'Deleted the area for {label}.',
    'editor.areaUndoDone': 'Removed the last vertex. {count} vertices remain.',
    'editor.areaVertexMoved': 'Adjusted a vertex for {label}.',
    'editor.areaHoverAria': 'Facility area for {label}',
    'editor.feedback.default':
      'Click a text location on the map to save its label. Turn on a ring tool to add or remove highlight rings by tapping the map.',
    'editor.jsonAria': 'JSON export output',
    'editor.move': 'Move',
    'editor.delete': 'Delete',
    'editor.alias': 'Alias',
    'editor.rectMeta': '{count} rect{rectSuffix}{aliases}',
    'editor.aliasMeta': ' / aliases: {aliases}',
    'editor.noRingTool': 'Turn on a facility button to add or remove rings for that facility.',
    'editor.noRings': 'There are no {facility} rings on {floor} yet.',
    'editor.ringLabel': '{facility} Ring {index}',
    'editor.ringLabelWithColor': '{facility} ({color}) Ring {index}',
    'editor.ringHandleAria': 'Edit the {facility} ring',
    'editor.ringHandleAriaWithColor': 'Edit the {color} {facility} ring',
    'editor.pinAria': 'Review {label}',
    'editor.noEntries': 'There is no manually entered data on {floor} yet.',
    'editor.mode.on':
      'Click a text location on the map to record its label. When a ring tool is active, you can add or remove rings.',
    'editor.mode.off': 'Turn on edit mode, then click a text location on the map.',
    'editor.ringModeToilet': 'Restroom ring edit mode. Current color: {color}',
    'editor.ringModeFacility':
      '{facility} ring edit mode. Tap the map to add a ring, or tap an existing ring to remove it.',
    'editor.ringModeOff': 'Click a text location on the map to record its label. Ring edit mode is off.',
    'editor.ringRecordFailed': 'The ring location could not be recorded.',
    'editor.ringAdded': 'Added a {facility} ring on {floor}.',
    'editor.ringAddedWithColor': 'Added a {color} {facility} ring on {floor}.',
    'editor.ringRemoved': 'Removed the {facility} ring from {floor}.',
    'editor.ringRemovedWithColor': 'Removed the {color} {facility} ring from {floor}.',
    'editor.ringsCleared': 'Cleared {count} {facility} ring{suffix} from {floor}.',
    'editor.ringSelected': '{floor} / {facility} Ring',
    'editor.ringSelectedWithColor': '{floor} / {facility} ({color}) Ring',
    'editor.ringMoved': 'Moved to the {facility} ring on {floor}.',
    'editor.ringMovedWithColor': 'Moved to the {color} {facility} ring on {floor}.',
    'editor.labelRequired': 'Enter a display name.',
    'editor.pointRequired': 'Click the map first to choose a location.',
    'editor.entryCreateFailed': 'Search data could not be created from the input.',
    'editor.entrySaved': 'Saved {label} on {floor}.',
    'editor.copied': 'Copied JSON to the clipboard.',
    'editor.copyFailed': 'Automatic copy failed, so the JSON has been selected.',
    'editor.exported': 'Saved {filename}.',
    'editor.imported':
      'Loaded {entries} search entr{entrySuffix} and {rings} ring draft{ringSuffix}. Click "Publish Changes" to send them to the viewer.',
    'editor.importedEmpty': 'Loaded an empty JSON file. Click "Publish Changes" to clear the viewer data too.',
    'editor.importFailed': 'Failed to import JSON.',
    'editor.published': 'Published {entries} search entr{entrySuffix} and {rings} ring{ringSuffix} to the viewer site.',
    'editor.publishedEmpty': 'Published an empty set of search data and rings to the viewer site.',
    'editor.specialFloorEditDisabled': 'Location editing is disabled while the printer map is displayed.',
    'editor.outsideMap': 'Locations outside the map cannot be recorded.',
    'editor.pointCaptured': 'Location selected. Enter a label and click "Save This Location".',
    'editor.pointCleared': 'Cleared the temporary location.',

    'color.red': 'Red',
    'color.blue': 'Blue',
    'color.yellow': 'Yellow',

    'login.aria': 'Editor Login',
    'login.title': 'Sign In to the Editor',
    'login.password': 'Password',
    'login.submit': 'Log In',
    'login.back': 'Back to the Viewer',
    'login.error.incorrect': 'Incorrect password.',

    'footer.legalNav': 'Legal links',
    'footer.siteInfo': 'Site information',
    'footer.terms': 'Terms',
    'footer.privacy': 'Privacy Policy',
    'footer.sources': 'Sources & Rights',
    'footer.creator': 'About the Creator',
    'footer.copyrightSimple': '© 2026 Issei Yasuda'
  }
};

let currentLang = readStoredLanguage();

function normalizeSupportedLanguage(value) {
  const language = String(value ?? '').trim().toLowerCase();

  if (language === 'ja' || language.startsWith('ja-')) {
    return 'ja';
  }

  if (language === 'en' || language.startsWith('en-')) {
    return 'en';
  }

  return null;
}

function readUrlLanguage() {
  const path = window.location.pathname;
  if (path === '/en' || path.startsWith('/en/')) return 'en';
  if (window.__DEFAULT_LANG__ === 'en') return 'en';
  return null;
}

function readStoredLanguage() {
  const urlLang = readUrlLanguage();
  if (urlLang !== null) return urlLang;

  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const storedLanguage = normalizeSupportedLanguage(stored);
    return storedLanguage ?? 'ja';
  } catch {
    return 'ja';
  }
}

function getPageKey() {
  const appMode = document.body?.dataset.appMode;

  if (appMode === 'editor') {
    return 'editor';
  }

  if (appMode === 'login' || window.location.pathname.startsWith('/editor/login')) {
    return 'login';
  }

  return 'viewer';
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

function setMetaContent(selector, content) {
  const node = document.querySelector(selector);

  if (node) {
    node.setAttribute('content', content);
  }
}

function updateJsonLd() {
  const script = document.querySelector('script[type="application/ld+json"][data-i18n-jsonld]');

  if (!script) {
    return;
  }

  const pageUrl = currentLang === 'en'
    ? 'https://rits-oic-map.app/en/'
    : 'https://rits-oic-map.app/';

  script.textContent = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: t('meta.title.viewer'),
      alternateName: t('meta.schemaAlternateName'),
      description: t('meta.description'),
      url: pageUrl,
      inLanguage: currentLang
    },
    null,
    2
  );
}

function applyDocumentMeta() {
  const pageKey = getPageKey();
  const title = t(`meta.title.${pageKey}`);
  const appName = t('meta.appName');
  const description = t('meta.description');

  document.documentElement.lang = currentLang;
  document.title = title;

  setMetaContent('meta[name="application-name"]', appName);
  setMetaContent('meta[name="apple-mobile-web-app-title"]', appName);
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:site_name"]', appName);
  setMetaContent('meta[property="og:title"]', t('meta.title.viewer'));
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[name="twitter:title"]', t('meta.title.viewer'));
  setMetaContent('meta[name="twitter:description"]', description);
  updateJsonLd();
}

function updateLanguageToggles(root = document) {
  root.querySelectorAll('[data-lang-toggle]').forEach((button) => {
    if (!button.querySelector('[data-lang-option]')) {
      const jpOption = document.createElement('span');
      jpOption.className = 'lang-toggle-option';
      jpOption.dataset.langOption = 'ja';
      jpOption.textContent = 'JA';

      const separator = document.createElement('span');
      separator.className = 'lang-toggle-separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '/';

      const enOption = document.createElement('span');
      enOption.className = 'lang-toggle-option';
      enOption.dataset.langOption = 'en';
      enOption.textContent = 'EN';

      button.replaceChildren(jpOption, separator, enOption);
    }

    button.querySelectorAll('[data-lang-option]').forEach((option) => {
      const isActive = option.dataset.langOption === currentLang;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
    button.setAttribute('aria-label', t('lang.toggle'));
    button.setAttribute('title', t('lang.toggle'));
  });
}

function setupLanguageToggles(root = document) {
  root.querySelectorAll('[data-lang-toggle]').forEach((button) => {
    if (button.dataset.langToggleReady === 'true') {
      return;
    }

    button.dataset.langToggleReady = 'true';
    button.addEventListener('click', (event) => {
      const option = event.target instanceof Element ? event.target.closest('[data-lang-option]') : null;
      if (option?.dataset.langOption) {
        setLang(option.dataset.langOption);
        return;
      }
      toggleLang();
    });
  });
}

export function getLang() {
  return currentLang;
}

export function getLocale() {
  return currentLang === 'en' ? 'en' : 'ja';
}

export function t(key, params = {}) {
  const dictionary = dictionaries[currentLang] ?? dictionaries.ja;
  const fallbackDictionary = dictionaries.ja;
  const template = dictionary[key] ?? fallbackDictionary[key] ?? key;
  return interpolate(template, params);
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });

  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle));
  });

  // Internal links: data-localized-href holds the page path; the English site
  // serves it under /en/. (The en/index.html sync may already have prefixed it.)
  root.querySelectorAll('[data-localized-href]').forEach((node) => {
    const path = node.dataset.localizedHref.replace(/^\/en(?=\/)/, '');
    node.setAttribute('href', currentLang === 'en' ? `/en${path}` : path);
  });

  applyDocumentMeta();
  updateLanguageToggles(root);
  setupLanguageToggles(root);
}

export function setLang(lang, { persist = true, notify = true } = {}) {
  const nextLang = lang === 'en' ? 'en' : 'ja';
  const appMode = document.body?.dataset.appMode;

  // The editor and login share one route across languages; keep their state
  // mounted instead of navigating to the public map.
  if (!window.__FILE_MODE__ && appMode !== 'editor' && appMode !== 'login') {
    const isEnPath = window.location.pathname === '/en' || window.location.pathname.startsWith('/en/');
    const needsNavigation = (nextLang === 'en' && !isEnPath) || (nextLang === 'ja' && isEnPath);

    if (needsNavigation) {
      if (persist) {
        try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLang); } catch {}
      }
      if (appMode === 'viewer') {
        const target = new URL(window.location.href);
        target.pathname = nextLang === 'en' ? '/en/' : '/';
        window.history.replaceState(window.history.state, '', `${target.pathname}${target.search}${target.hash}`);
      } else {
        window.location.href = nextLang === 'en' ? '/en/' : '/';
        return nextLang;
      }
    }
  }

  if (nextLang === currentLang) {
    applyI18n();
    return currentLang;
  }

  currentLang = nextLang;

  if (persist) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLang);
    } catch {
      // Ignore storage failures; the page still switches language for this session.
    }
  }

  applyI18n();

  if (notify) {
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { lang: currentLang } }));
  }

  return currentLang;
}

export function toggleLang() {
  return setLang(currentLang === 'ja' ? 'en' : 'ja');
}

export function onLanguageChange(handler) {
  window.addEventListener(LANGUAGE_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handler);
}

document.documentElement.lang = currentLang;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyI18n(), { once: true });
} else {
  applyI18n();
}

window.OIC_I18N = {
  applyI18n,
  getLang,
  setLang,
  t,
  toggleLang
};
