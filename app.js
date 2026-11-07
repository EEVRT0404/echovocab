/**
 * EchoVocab 靈語單字 - 智慧個性化背英文系統
 * 全功能客戶端核心腳本
 */

// ==================== 1. 音效引擎 (Web Audio API) ====================
class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  }

  playSuccess() {
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      // 靜音保護
    }
  }

  playError() {
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.15);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  playFlip() {
    try {
      this.init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {}
  }

  playFanfare() {
    try {
      this.init();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.12;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      });
    } catch (e) {}
  }
}

// ==================== 2. TTS 語音發音服務 ====================
class TTSService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.selectedVoiceURI = '';
    this.rate = 1.0;
    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;
    const loadVoices = () => {
      this.voices = this.synth.getVoices().filter(v => v.lang.startsWith('en'));
      if (!this.selectedVoiceURI && this.voices.length > 0) {
        // 優先找美式或英式
        const usVoice = this.voices.find(v => v.lang === 'en-US' || v.name.includes('US') || v.name.includes('Natural'));
        this.selectedVoiceURI = usVoice ? usVoice.voiceURI : this.voices[0].voiceURI;
      }
    };
    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  speak(text) {
    if (!this.synth || !text) return;
    this.synth.cancel(); // 停止先前的朗讀
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate || 1.0;
    if (this.selectedVoiceURI) {
      const voice = this.voices.find(v => v.voiceURI === this.selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    this.synth.speak(utterance);
  }
}

// ==================== 3. SM-2 間隔重複 (SRS) 算法 ====================
class SRSService {
  static calculate(word, grade) {
    // grade: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    let { repetitions = 0, interval = 1, easeFactor = 2.5 } = word.srs || {};

    if (grade >= 3) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = grade === 4 ? 4 : 3;
      } else {
        const factor = grade === 4 ? easeFactor * 1.3 : easeFactor;
        interval = Math.round(interval * factor);
      }
      repetitions += 1;
    } else if (grade === 2) {
      // 困難：維持當前間隔或小幅增加 1.2 倍
      interval = Math.max(1, Math.round(interval * 1.2));
      repetitions += 1;
    } else {
      // 忘記了 (Again)
      repetitions = 0;
      interval = 1;
    }

    // 更新 Ease Factor (SM-2 標準微調公式)
    // EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    // 映射到 grade 1~4
    const quality = grade + 1; // 映射為 2~5
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;
    if (easeFactor > 2.8) easeFactor = 2.8;

    const today = new Date();
    const nextDate = new Date();
    nextDate.setDate(today.getDate() + interval);

    // 計算掌握度級別 0 ~ 5
    let masteryLevel = 0;
    if (repetitions >= 5 || interval >= 30) masteryLevel = 5;
    else if (repetitions >= 4 || interval >= 14) masteryLevel = 4;
    else if (repetitions >= 3 || interval >= 7) masteryLevel = 3;
    else if (repetitions >= 2 || interval >= 3) masteryLevel = 2;
    else if (repetitions >= 1) masteryLevel = 1;

    return {
      repetitions,
      interval,
      easeFactor: parseFloat(easeFactor.toFixed(2)),
      nextReviewDate: nextDate.toISOString().split('T')[0],
      lastReviewed: today.toISOString(),
      masteryLevel
    };
  }

  static isDue(word) {
    if (!word.srs || !word.srs.nextReviewDate) return true;
    const todayStr = new Date().toISOString().split('T')[0];
    return word.srs.nextReviewDate <= todayStr;
  }
}

// ==================== 4. CSV 服務 (含 UTF-8 BOM 支援) ====================
class CSVService {
  static exportToCSV(words) {
    const headers = [
      'Word',
      'Phonetic',
      'PartOfSpeech',
      'Definition',
      'Example_EN',
      'Example_ZH',
      'Mnemonic',
      'Tags',
      'MasteryLevel',
      'NextReviewDate'
    ];

    const escapeCSV = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = words.map(w => [
      escapeCSV(w.word),
      escapeCSV(w.phonetic || ''),
      escapeCSV(w.partOfSpeech || ''),
      escapeCSV(w.definition || ''),
      escapeCSV(w.example_en || ''),
      escapeCSV(w.example_zh || ''),
      escapeCSV(w.mnemonic || ''),
      escapeCSV((w.tags || []).join('; ')),
      escapeCSV(w.srs?.masteryLevel ?? 0),
      escapeCSV(w.srs?.nextReviewDate || '')
    ].join(','));

    // 加入 UTF-8 BOM '\uFEFF' 以防 Excel 繁體中文亂碼
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `echovocab_words_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 完整支援引號跳脫與換行符號的 RFC 4180 CSV 解析器
  static parseCSV(csvText) {
    // 移除 UTF-8 BOM
    if (csvText.charCodeAt(0) === 0xFEFF) {
      csvText = csvText.slice(1);
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++; // 跳過下一個引號
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\r') {
          if (nextChar === '\n') i++;
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else if (char === '\n') {
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    const parsedWords = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] || '';
      });

      // 欄位容錯對應
      const word = obj['word'] || obj['vocab'] || row[0] || '';
      if (!word) continue;

      const tagsRaw = obj['tags'] || obj['tag'] || '';
      const tags = tagsRaw ? tagsRaw.split(/[;,|]/).map(t => t.trim()).filter(Boolean) : [];

      parsedWords.push({
        id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        word: word.trim(),
        phonetic: obj['phonetic'] || obj['ipa'] || obj['pronunciation'] || '',
        partOfSpeech: obj['partofspeech'] || obj['pos'] || '',
        definition: obj['definition'] || obj['meaning'] || obj['chinese'] || '',
        example_en: obj['example_en'] || obj['example'] || obj['examplesentence'] || '',
        example_zh: obj['example_zh'] || obj['translation'] || '',
        mnemonic: obj['mnemonic'] || obj['memorytip'] || obj['note'] || '',
        tags: tags.length ? tags : ['未分類'],
        createdAt: new Date().toISOString(),
        srs: {
          repetitions: 0,
          interval: 1,
          easeFactor: 2.5,
          nextReviewDate: new Date().toISOString().split('T')[0],
          lastReviewed: null,
          masteryLevel: parseInt(obj['masterylevel']) || 0
        }
      });
    }

    return parsedWords;
  }
}

// ==================== 5. Gemini AI 整合服務 ====================
class GeminiService {
  constructor(apiKey = '', model = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  setApiKey(key) {
    this.apiKey = key ? key.trim() : '';
  }

  setModel(model) {
    this.model = model || 'gemini-1.5-flash';
  }

  async callGemini(prompt, systemInstruction = '') {
    if (!this.apiKey) {
      throw new Error('NO_API_KEY');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API 請求失敗 (HTTP ${response.status})`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error('Gemini API 未回傳有效內容');
    }

    return candidate.content.parts[0].text;
  }

  // 1. 單字或片語智慧解析
  async analyzeWordOrList(inputWords, targetTags = ['AI擴充']) {
    try {
      const prompt = `你是一位專業的英文教學與記憶大師。請分析以下使用者提供的單字、片語或短語：
"${inputWords}"

請為每個單字/片語提供完整的學習資料，包含：
- word: 正確英文原型單字或片語
- phonetic: 國際音標 (IPA)，例如 /ˌserənˈdɪpəti/
- partOfSpeech: 詞性縮寫，例如 n., v., adj., adv., phrase
- definition: 繁體中文詳細且準確的釋義
- example_en: 1句地道生動、符合生活或職場語境的英文例句
- example_zh: 繁體中文例句翻譯
- mnemonic: 超有趣的記憶聯想法（可包含諧音梗、字根字首分析或圖像化口訣，幫助秒記）
- tags: 推薦的分類標籤陣列，例如 ["生活英語", "商務"]

請直接回傳純 JSON 陣列，不要有任何 Markdown 註記或外層程式碼區塊包裹，格式範例如下：
[
  {
    "word": "epiphany",
    "phonetic": "/ɪˈpɪfəni/",
    "partOfSpeech": "n.",
    "definition": "頓悟；靈光乍現",
    "example_en": "He had an epiphany that changed his entire career path.",
    "example_zh": "他突然有了一次頓悟，徹底改變了他的職業軌跡。",
    "mnemonic": "諧音：一匹憤逆 -> 在困境中突然反轉，靈光一閃領悟人生！",
    "tags": ["思維", "心理"]
  }
]`;

      const text = await this.callGemini(prompt, '你只回傳有效的 JSON 陣列，不輸出任何其他開場白或額外文字。');
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return this.mapToWordObjects(parsed, targetTags);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：尚未設定 API Key，已為您生成本機模擬智慧卡片。可至右上角 ⚙️ 設定填入 Gemini Key！', 'info');
        // 智慧本地拆解
        const rawList = inputWords.split(/[,，\n、]/).map(w => w.trim()).filter(Boolean);
        const mocked = rawList.map(w => ({
          word: w,
          phonetic: `/ˈ${w.toLowerCase()}/`,
          partOfSpeech: 'n./v.',
          definition: `【示範釋義】關於「${w}」的中文含義（請配置 Gemini API Key 獲取最精準官方定義與例句）`,
          example_en: `This is a practical demonstration sentence illustrating the usage of "${w}".`,
          example_zh: `這是一個展示「${w}」用法的示範例句。`,
          mnemonic: `聯想記憶法：專注觀察「${w}」的結構，連結生活記憶場景。`,
          tags: targetTags
        }));
        return this.mapToWordObjects(mocked, targetTags);
      }
      throw err;
    }
  }

  mapToWordObjects(list, defaultTags) {
    return list.map(item => ({
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      word: item.word,
      phonetic: item.phonetic || '',
      partOfSpeech: item.partOfSpeech || '',
      definition: item.definition || '',
      example_en: item.example_en || '',
      example_zh: item.example_zh || '',
      mnemonic: item.mnemonic || '',
      tags: item.tags?.length ? item.tags : defaultTags,
      createdAt: new Date().toISOString(),
      srs: {
        repetitions: 0,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString().split('T')[0],
        lastReviewed: null,
        masteryLevel: 0
      }
    }));
  }

  // 2. 情境主題單字擴展產生器
  async generateThemeWords(themeTopic, count = 6) {
    try {
      const prompt = `請針對主題「${themeTopic}」，挑選 ${count} 個最實用、最核心的高頻英文單字或地道片語。
請以繁體中文輸出完整的學習卡片 JSON 陣列，欄位包含 word, phonetic, partOfSpeech, definition, example_en, example_zh, mnemonic, tags。
請直接回傳純 JSON 陣列。`;
      const text = await this.callGemini(prompt, '只回傳嚴格合法的 JSON 陣列。');
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：尚未設定 API Key，為您呈現情境精選示範單字！可至 ⚙️ 設定填入 Key', 'info');
        return [
          {
            word: 'ambience',
            phonetic: '/ˈæmbiəns/',
            partOfSpeech: 'n.',
            definition: '氣氛；情調；環境氛圍',
            example_en: 'The cafe has a relaxing and cozy ambience.',
            example_zh: '這家咖啡館有著放鬆且溫馨的氛圍。',
            mnemonic: '諧音「按扁死」：燈光調暗、音樂柔和，沉浸在放鬆的情調中。',
            tags: [themeTopic]
          },
          {
            word: 'customized',
            phonetic: '/ˈkʌstəmaɪzd/',
            partOfSpeech: 'adj.',
            definition: '定制的；客製化的',
            example_en: 'You can order a customized beverage with oat milk and extra espresso.',
            example_zh: '你可以點一杯加入燕麥奶和濃縮咖啡的客製化飲品。',
            mnemonic: 'custom (習俗、顧客) -> 按照顧客需求量身打造。',
            tags: [themeTopic]
          },
          {
            word: 'complimentary',
            phonetic: '/ˌkɒmplɪˈmentri/',
            partOfSpeech: 'adj.',
            definition: '免費贈送的；讚美的',
            example_en: 'The hotel offers complimentary breakfast and Wi-Fi.',
            example_zh: '這間飯店提供免費的早餐與無線網路。',
            mnemonic: '來自 compliment (稱讚、致敬) -> 給客人的致意禮遇，就是免費贈送！',
            tags: [themeTopic]
          }
        ];
      }
      throw err;
    }
  }

  // 3. AI 實戰造句評分與改進
  async gradeSentence(word, userSentence) {
    try {
      const prompt = `使用者正在學習單字 "${word}"，並寫下了以下造句：
"${userSentence}"

請扮演資深外籍美語家教進行評估，提供繁體中文回饋，請嚴格按照以下 JSON 格式回傳：
{
  "score": 85, // 0~100 的綜合評分
  "isCorrect": true, // 單字用法與文法是否基本正確
  "grammarFeedback": "文法與時態分析說明...",
  "naturalFeedback": "道地程度與母語者用詞習慣說明...",
  "betterVersion": "母語人士更道地自然的修飾版本句子",
  "encouragement": "溫暖且具體的鼓勵話語"
}
只輸出純 JSON，不要附加任何 Markdown 標記。`;

      const text = await this.callGemini(prompt, '只回傳嚴格合法的 JSON 物件。');
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：示範評分模式（填入 Gemini API Key 可獲得真 AI 深度診斷）', 'info');
        return {
          score: 90,
          isCorrect: true,
          grammarFeedback: `造句文法結構良好，成功運用了單字「${word}」！`,
          naturalFeedback: '表達清晰，若加入更多語境細節會更加生動道地。',
          betterVersion: `${userSentence.trim().replace(/\.$/, '')}, which left a lasting impression on everyone.`,
          encouragement: '非常棒的嘗試！持續每日用生詞造句是掌握英文的不二法門！'
        };
      }
      throw err;
    }
  }

  // 4. AI 故事串聯記憶產生器
  async generateStory(wordsList) {
    try {
      const prompt = `請將以下單字：[${wordsList.join(', ')}]
串聯寫成一篇長度約 80~140 字的趣味英語短故事或生活情境對話。
要求：
1. 必須自然地融入所有給定的單字，並將這些單字用 <b>...</b> 粗體醒目標記。
2. 故事要有情節、畫面感與幽默感，方便使用者串聯記憶。
3. 提供流暢優美的繁體中文全文翻譯。

回傳 JSON 格式：
{
  "title_en": "故事英文標題",
  "title_zh": "中文翻譯標題",
  "story_en": "英文故事全文(含 <b>單字</b> 粗體)",
  "story_zh": "繁體中文對照翻譯",
  "takeaway": "一句讀後金句或記憶關鍵總結"
}
只回傳純 JSON。`;

      const text = await this.callGemini(prompt, '只回傳純 JSON 物件。');
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：示範情境短文（填入 Gemini API Key 享受無限 AI 創作故事）', 'info');
        return {
          title_en: 'A Spark of Inspiration',
          title_zh: '靈光乍現的一天',
          story_en: `It was a morning of pure <b>${wordsList[0] || 'serendipity'}</b> when Alex decided to stop <b>${wordsList[1] || 'procrastinating'}</b>. With remarkable <b>${wordsList[2] || 'resilience'}</b>, he had a sudden <b>${wordsList[3] || 'epiphany'}</b> that success is not accidental, but created step by step every single day.`,
          story_zh: `這是一個純粹幸運的早晨，亞歷克斯決定不再拖延。憑藉著非凡的韌性，他突然靈光乍現：成功並非偶然，而是一步一腳印踏實累積而來的。`,
          takeaway: '生活中的美好往往藏在堅持與行動的轉角處。'
        };
      }
      throw err;
    }
  }
}

// ==================== 6. 應用核心狀態與控制器 ====================
class AppState {
  constructor() {
    this.words = [];
    this.settings = {
      apiKey: '',
      model: 'gemini-1.5-flash',
      voiceURI: '',
      speechRate: 1.0,
      autoPlayAudio: true,
      darkMode: false
    };
    this.currentView = 'dashboard';
    this.activeTag = 'all';
    this.searchQuery = '';
    
    // 複習翻卡狀態
    this.flashcardList = [];
    this.flashcardIndex = 0;
    this.isCardFlipped = false;

    // 拼字測驗狀態
    this.spellingList = [];
    this.spellingIndex = 0;
    this.spellingCombo = 0;
    this.spellingScore = 0;

    // 連續打卡
    this.streak = 1;
    this.lastStudyDate = '';
  }

  load() {
    try {
      const storedWords = localStorage.getItem('echovocab_words_v1');
      if (storedWords) {
        this.words = JSON.parse(storedWords);
      } else {
        this.words = this.getDefaultWords();
        this.saveWords();
      }

      const storedSettings = localStorage.getItem('echovocab_settings_v1');
      if (storedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(storedSettings) };
      }

      const streakData = localStorage.getItem('echovocab_streak_v1');
      if (streakData) {
        const { streak, lastStudyDate } = JSON.parse(streakData);
        this.streak = streak || 1;
        this.lastStudyDate = lastStudyDate || '';
        this.checkStreak();
      }
    } catch (e) {
      console.error('載入本機資料失敗', e);
    }
  }

  saveWords() {
    localStorage.setItem('echovocab_words_v1', JSON.stringify(this.words));
  }

  saveSettings() {
    localStorage.setItem('echovocab_settings_v1', JSON.stringify(this.settings));
  }

  saveStreak() {
    localStorage.setItem('echovocab_streak_v1', JSON.stringify({
      streak: this.streak,
      lastStudyDate: this.lastStudyDate
    }));
  }

  checkStreak() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastStudyDate === today) {
      return; // 今天已打卡
    }
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (this.lastStudyDate === yesterdayStr) {
      // 連續
    } else if (this.lastStudyDate && this.lastStudyDate < yesterdayStr) {
      // 中斷
      this.streak = 1;
    }
  }

  recordStudyToday() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastStudyDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (this.lastStudyDate === yesterdayStr) {
        this.streak += 1;
      } else {
        this.streak = 1;
      }
      this.lastStudyDate = today;
      this.saveStreak();
    }
  }

  getDefaultWords() {
    return [
      {
        id: 'w_init_1',
        word: 'serendipity',
        phonetic: '/ˌserənˈdɪpəti/',
        partOfSpeech: 'n.',
        definition: '意外發現美好事物的機緣；幸運的小確幸',
        example_en: 'Finding this cozy bookstore in the alley was pure serendipity.',
        example_zh: '在巷弄中發現這間溫馨的書店純粹是個美好的意外驚喜。',
        mnemonic: '諧音「撕肉滴破涕」：撕下一塊美味香肉，感動得破涕為笑，意想不到的幸運收穫！',
        tags: ['進階美詞', '生活小確幸'],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 0 }
      },
      {
        id: 'w_init_2',
        word: 'epiphany',
        phonetic: '/ɪˈpɪfəni/',
        partOfSpeech: 'n.',
        definition: '頓悟；突然的領悟；靈光乍現',
        example_en: 'During the morning shower, she had an epiphany about how to solve the algorithm.',
        example_zh: '在早晨洗澡時，她靈光乍現，突然想到了如何解決那個演算法。',
        mnemonic: '諧音「一匹憤逆」：困境中突然逆轉，腦洞大開，瞬間頓悟！',
        tags: ['心靈思維', '寫作必備'],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 1, interval: 3, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 2 }
      },
      {
        id: 'w_init_3',
        word: 'resilience',
        phonetic: '/rɪˈzɪliəns/',
        partOfSpeech: 'n.',
        definition: '心理韌性；復原力；彈性',
        example_en: 'Her resilience and optimism helped the entire team get through the crisis.',
        example_zh: '她的堅韌不拔與樂觀心態幫助整個團隊度過了危機。',
        mnemonic: '詞根 re(往回) + sili(跳躍) -> 彈回原狀，無論被壓得多扁都能反彈！',
        tags: ['多益必備', '職場能力'],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 2, interval: 6, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 3 }
      },
      {
        id: 'w_init_4',
        word: 'ubiquitous',
        phonetic: '/juːˈbɪkwɪtəs/',
        partOfSpeech: 'adj.',
        definition: '無所不在的；隨處可見的',
        example_en: 'Artificial intelligence is becoming ubiquitous in our daily lives.',
        example_zh: '人工智慧在我們的日常生活中正變得無所不在。',
        mnemonic: 'ubi(何處) + quique(任何) -> 任何角落都看得到，鋪天蓋地！',
        tags: ['科技趨勢', '雅思高頻'],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 0 }
      },
      {
        id: 'w_init_5',
        word: 'procrastinate',
        phonetic: '/prəʊˈkræstɪneɪt/',
        partOfSpeech: 'v.',
        definition: '拖延；拖延症；推遲',
        example_en: 'Stop procrastinating and finish your assignment before the deadline!',
        example_zh: '別再拖延了，趕在截止日期前把作業做完吧！',
        mnemonic: 'pro(向前推) + cras(明天) -> 永遠推給明天做，這就是拖延症！',
        tags: ['生活口語', '自我提升'],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 3, interval: 10, easeFactor: 2.6, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 3 }
      }
    ];
  }
}

// 全域實例
const app = new AppState();
const sound = new SoundEngine();
const tts = new TTSService();
const gemini = new GeminiService();

// ==================== 7. UI 控制與事件繫結 ====================
document.addEventListener('DOMContentLoaded', () => {
  app.load();
  gemini.setApiKey(app.settings.apiKey);
  gemini.setModel(app.settings.model);
  tts.rate = app.settings.speechRate || 1.0;
  tts.selectedVoiceURI = app.settings.voiceURI || '';

  // 主題套用
  applyTheme(app.settings.darkMode);

  // 初始化視圖
  setupNavigation();
  setupSettingsModal();
  setupGlobalShortcuts();
  renderCurrentView();

  // 激勵每日金句
  renderQuote();
});

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-indigo-600 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-600 text-white',
    error: 'bg-rose-600 text-white'
  };
  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl transition-all duration-300 transform translate-y-4 opacity-0 text-sm font-medium ${bgColors[type] || bgColors.info}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// 每日金句庫
function renderQuote() {
  const quotes = [
    { en: "A different language is a different vision of life.", zh: "一種不同的語言，就是一種不同的人生視野。", author: "Federico Fellini" },
    { en: "The limits of my language mean the limits of my world.", zh: "我語言的極限，意味著我世界的極限。", author: "Ludwig Wittgenstein" },
    { en: "Small daily improvements over time lead to stunning results.", zh: "每天微小的進步累積起來，會帶來驚人的成果。", author: "Robin Sharma" },
    { en: "Language is the road map of a culture.", zh: "語言是文化的路線圖，指引你探索世界。", author: "Rita Mae Brown" },
    { en: "Consistency is what transforms average into excellence.", zh: "持之以恆，能將平凡化為卓越。", author: "Tony Robbins" }
  ];
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  const el = document.getElementById('daily-quote');
  if (el) {
    el.innerHTML = `
      <div class="italic text-gray-700 dark:text-gray-200 font-medium">"${q.en}"</div>
      <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${q.zh} — <span class="font-semibold">${q.author}</span></div>
    `;
  }
}

// ==================== 8. 視圖路由切換 ====================
function setupNavigation() {
  const navBtns = document.querySelectorAll('[data-nav-target]');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = btn.getAttribute('data-nav-target');
      switchView(target);
    });
  });
}

function switchView(viewName) {
  app.currentView = viewName;
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => v.classList.add('hidden'));

  const activeView = document.getElementById(`view-${viewName}`);
  if (activeView) {
    activeView.classList.remove('hidden');
  }

  // 更新導覽列高亮
  const navBtns = document.querySelectorAll('[data-nav-target]');
  navBtns.forEach(btn => {
    if (btn.getAttribute('data-nav-target') === viewName) {
      btn.classList.add('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/50');
      btn.classList.remove('text-gray-600', 'dark:text-gray-300');
    } else {
      btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'bg-indigo-50', 'dark:bg-indigo-950/50');
      btn.classList.add('text-gray-600', 'dark:text-gray-300');
    }
  });

  renderCurrentView();
  lucide.createIcons();
}

function renderCurrentView() {
  switch (app.currentView) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'wordbank':
      renderWordBank();
      break;
    case 'add':
      renderAddView();
      break;
    case 'flashcard':
      initFlashcardMode();
      break;
    case 'spelling':
      initSpellingMode();
      break;
    case 'ai-lab':
      initAILabView();
      break;
    case 'data':
      renderDataView();
      break;
  }
}

// ==================== 9. 總覽儀表板 (Dashboard) ====================
function renderDashboard() {
  const totalWords = app.words.length;
  const dueWords = app.words.filter(w => SRSService.isDue(w));
  const masteredWords = app.words.filter(w => (w.srs?.masteryLevel ?? 0) >= 4).length;

  const navStreak = document.getElementById('nav-streak');
  const dashStreak = document.getElementById('dash-streak');
  if (navStreak) navStreak.textContent = app.streak;
  if (dashStreak) dashStreak.textContent = app.streak;
  document.getElementById('dash-total-words').textContent = totalWords;
  document.getElementById('dash-due-words').textContent = dueWords.length;
  document.getElementById('dash-mastered-words').textContent = masteredWords;

  // 掌握度進度條
  const levels = [0, 0, 0, 0, 0, 0];
  app.words.forEach(w => {
    const lvl = w.srs?.masteryLevel ?? 0;
    levels[lvl] = (levels[lvl] || 0) + 1;
  });

  const levelContainer = document.getElementById('dash-level-distribution');
  if (levelContainer) {
    const levelNames = ['新學/未評級', '初識 (L1)', '熟悉 (L2)', '掌握 (L3)', '鞏固 (L4)', '永久精通 (L5)'];
    const colors = ['bg-gray-400', 'bg-blue-400', 'bg-indigo-400', 'bg-emerald-400', 'bg-amber-400', 'bg-purple-500'];
    
    levelContainer.innerHTML = levels.map((cnt, idx) => {
      const pct = totalWords > 0 ? Math.round((cnt / totalWords) * 100) : 0;
      return `
        <div>
          <div class="flex justify-between text-xs mb-1 font-medium">
            <span class="text-gray-600 dark:text-gray-300">${levelNames[idx]}</span>
            <span class="text-gray-900 dark:text-gray-100 font-semibold">${cnt} 個 (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div class="${colors[idx]} h-full transition-all duration-500" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 今日待複習快捷按鈕提示
  const dueBtn = document.getElementById('dash-btn-start-review');
  if (dueBtn) {
    dueBtn.onclick = () => switchView('flashcard');
    const badge = document.getElementById('dash-review-badge');
    if (badge) badge.textContent = `${dueWords.length} 個待複習`;
  }

  const spellBtn = document.getElementById('dash-btn-start-spelling');
  if (spellBtn) {
    spellBtn.onclick = () => switchView('spelling');
  }

  const addBtn = document.getElementById('dash-btn-add-word');
  if (addBtn) {
    addBtn.onclick = () => switchView('add');
  }
}

// ==================== 10. 單字庫管理 (Word Bank) ====================
function renderWordBank() {
  const container = document.getElementById('wordbank-list');
  const tagFilterEl = document.getElementById('wordbank-tag-filter');
  const countEl = document.getElementById('wordbank-count');
  const searchInput = document.getElementById('wordbank-search');

  // 取得所有標籤
  const tagsSet = new Set();
  app.words.forEach(w => (w.tags || []).forEach(t => tagsSet.add(t)));
  const allTags = Array.from(tagsSet);

  if (tagFilterEl) {
    tagFilterEl.innerHTML = `
      <option value="all">所有標籤 (${app.words.length})</option>
      ${allTags.map(t => `<option value="${t}" ${app.activeTag === t ? 'selected' : ''}>#${t}</option>`).join('')}
    `;
    tagFilterEl.onchange = (e) => {
      app.activeTag = e.target.value;
      renderWordBank();
    };
  }

  if (searchInput) {
    searchInput.value = app.searchQuery;
    searchInput.oninput = (e) => {
      app.searchQuery = e.target.value.toLowerCase().trim();
      renderWordBankList();
    };
  }

  renderWordBankList();
}

function renderWordBankList() {
  const container = document.getElementById('wordbank-list');
  const countEl = document.getElementById('wordbank-count');
  if (!container) return;

  let filtered = app.words;

  // 標籤篩選
  if (app.activeTag !== 'all') {
    filtered = filtered.filter(w => (w.tags || []).includes(app.activeTag));
  }

  // 搜尋字詞
  if (app.searchQuery) {
    filtered = filtered.filter(w => 
      w.word.toLowerCase().includes(app.searchQuery) ||
      (w.definition || '').toLowerCase().includes(app.searchQuery) ||
      (w.mnemonic || '').toLowerCase().includes(app.searchQuery)
    );
  }

  if (countEl) countEl.textContent = `共 ${filtered.length} 個單字`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 bg-white/50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
        <i data-lucide="book-open" class="w-12 h-12 mx-auto text-gray-400 mb-3"></i>
        <h4 class="text-base font-semibold text-gray-700 dark:text-gray-300">沒有符合條件的單字</h4>
        <p class="text-sm text-gray-500 mt-1">試試調整搜尋字詞或點擊「新增單字」豐富你的單字庫！</p>
      </div>
    `;
    lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = filtered.map(w => {
    const isDue = SRSService.isDue(w);
    const mastery = w.srs?.masteryLevel ?? 0;
    const masteryColors = ['bg-gray-100 text-gray-600', 'bg-blue-100 text-blue-700', 'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-purple-100 text-purple-800'];
    const darkMasteryColors = ['dark:bg-gray-800 dark:text-gray-300', 'dark:bg-blue-900/60 dark:text-blue-300', 'dark:bg-indigo-900/60 dark:text-indigo-300', 'dark:bg-emerald-900/60 dark:text-emerald-300', 'dark:bg-amber-900/60 dark:text-amber-300', 'dark:bg-purple-900/60 dark:text-purple-300'];

    return `
      <div class="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:shadow-lg transition-all duration-200 group relative border border-gray-200/70 dark:border-gray-700/60">
        <div>
          <!-- 頂部標籤與掌握度 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs px-2.5 py-0.5 rounded-full font-medium ${masteryColors[mastery]} ${darkMasteryColors[mastery]}">
                Level ${mastery}
              </span>
              ${isDue ? `<span class="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> 今日需複習</span>` : ''}
            </div>
            <!-- 操作按鈕 -->
            <div class="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
              <button onclick="playWordTTS('${escapeQuotes(w.word)}')" title="真人朗讀" class="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-gray-700 transition">
                <i data-lucide="volume-2" class="w-4 h-4"></i>
              </button>
              <button onclick="editWordModal('${w.id}')" title="編輯" class="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-gray-700 transition">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteWordConfirm('${w.id}')" title="刪除" class="p-1.5 rounded-lg text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-gray-700 transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- 單字與音標 -->
          <div class="flex items-baseline gap-2 mb-1">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${w.word}</h3>
            ${w.partOfSpeech ? `<span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 italic">${w.partOfSpeech}</span>` : ''}
            ${w.phonetic ? `<span class="text-xs text-gray-500 dark:text-gray-400 phonetic-text">${w.phonetic}</span>` : ''}
          </div>

          <!-- 中文釋義 -->
          <div class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
            ${w.definition || '<span class="text-gray-400">尚無定義</span>'}
          </div>

          <!-- 例句 -->
          ${w.example_en ? `
            <div class="bg-gray-50 dark:bg-gray-800/80 p-2.5 rounded-xl text-xs mb-3 border border-gray-100 dark:border-gray-700/50">
              <div class="text-gray-700 dark:text-gray-300 font-medium mb-0.5">${w.example_en}</div>
              ${w.example_zh ? `<div class="text-gray-500 dark:text-gray-400">${w.example_zh}</div>` : ''}
            </div>
          ` : ''}

          <!-- 記憶聯想法 -->
          ${w.mnemonic ? `
            <div class="text-xs text-amber-800 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg mb-3 flex items-start gap-1.5">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500"></i>
              <span>${w.mnemonic}</span>
            </div>
          ` : ''}
        </div>

        <!-- 底部標籤 -->
        <div class="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          ${(w.tags || []).map(t => `<span class="text-[11px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md">#${t}</span>`).join('')}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons({ root: container });
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function playWordTTS(word) {
  sound.playFlip();
  tts.speak(word);
}

function deleteWordConfirm(id) {
  const word = app.words.find(w => w.id === id);
  if (!word) return;
  if (confirm(`確定要刪除單字「${word.word}」嗎？`)) {
    app.words = app.words.filter(w => w.id !== id);
    app.saveWords();
    showToast(`已刪除 ${word.word}`, 'info');
    renderWordBank();
  }
}

// 編輯單字 Modal
function editWordModal(id) {
  const word = app.words.find(w => w.id === id);
  if (!word) return;

  const modal = document.getElementById('edit-modal');
  if (!modal) return;

  document.getElementById('edit-word-id').value = word.id;
  document.getElementById('edit-word-input').value = word.word;
  document.getElementById('edit-phonetic-input').value = word.phonetic || '';
  document.getElementById('edit-pos-input').value = word.partOfSpeech || '';
  document.getElementById('edit-def-input').value = word.definition || '';
  document.getElementById('edit-example-en').value = word.example_en || '';
  document.getElementById('edit-example-zh').value = word.example_zh || '';
  document.getElementById('edit-mnemonic').value = word.mnemonic || '';
  document.getElementById('edit-tags').value = (word.tags || []).join(', ');

  modal.classList.remove('hidden');
  lucide.createIcons({ root: modal });
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.classList.add('hidden');
}

function saveEditedWord() {
  const id = document.getElementById('edit-word-id').value;
  const wordIndex = app.words.findIndex(w => w.id === id);
  if (wordIndex === -1) return;

  const wordVal = document.getElementById('edit-word-input').value.trim();
  if (!wordVal) {
    showToast('單字不能為空', 'warning');
    return;
  }

  const tagsRaw = document.getElementById('edit-tags').value;
  const tags = tagsRaw.split(/[,，、;]/).map(t => t.trim()).filter(Boolean);

  app.words[wordIndex] = {
    ...app.words[wordIndex],
    word: wordVal,
    phonetic: document.getElementById('edit-phonetic-input').value.trim(),
    partOfSpeech: document.getElementById('edit-pos-input').value.trim(),
    definition: document.getElementById('edit-def-input').value.trim(),
    example_en: document.getElementById('edit-example-en').value.trim(),
    example_zh: document.getElementById('edit-example-zh').value.trim(),
    mnemonic: document.getElementById('edit-mnemonic').value.trim(),
    tags: tags.length ? tags : ['未分類']
  };

  app.saveWords();
  closeEditModal();
  showToast('單字更新成功！', 'success');
  renderWordBank();
}

// ==================== 11. 新增單字 (AI 智慧解析 + 手動) ====================
function renderAddView() {
  const aiTabBtn = document.getElementById('tab-btn-ai');
  const manualTabBtn = document.getElementById('tab-btn-manual');
  const themeTabBtn = document.getElementById('tab-btn-theme');

  const aiSection = document.getElementById('section-ai-add');
  const manualSection = document.getElementById('section-manual-add');
  const themeSection = document.getElementById('section-theme-add');

  const switchTab = (tab) => {
    [aiSection, manualSection, themeSection].forEach(s => s?.classList.add('hidden'));
    [aiTabBtn, manualTabBtn, themeTabBtn].forEach(b => b?.classList.remove('active-tab', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400'));

    if (tab === 'ai') {
      aiSection?.classList.remove('hidden');
      aiTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    } else if (tab === 'manual') {
      manualSection?.classList.remove('hidden');
      manualTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    } else if (tab === 'theme') {
      themeSection?.classList.remove('hidden');
      themeTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    }
  };

  if (aiTabBtn) aiTabBtn.onclick = () => switchTab('ai');
  if (manualTabBtn) manualTabBtn.onclick = () => switchTab('manual');
  if (themeTabBtn) themeTabBtn.onclick = () => switchTab('theme');

  // AI 智能解析送出按鈕
  const aiSubmitBtn = document.getElementById('btn-ai-submit');
  if (aiSubmitBtn) {
    aiSubmitBtn.onclick = handleAISubmit;
  }

  // 情境擴充生成按鈕
  const themeSubmitBtn = document.getElementById('btn-theme-submit');
  if (themeSubmitBtn) {
    themeSubmitBtn.onclick = handleThemeSubmit;
  }

  // 手動新增按鈕
  const manualSubmitBtn = document.getElementById('btn-manual-submit');
  if (manualSubmitBtn) {
    manualSubmitBtn.onclick = handleManualSubmit;
  }

  // 手動模式中的「AI 幫我補全音標與例句」按鈕
  const aiAutoCompleteBtn = document.getElementById('btn-manual-ai-fill');
  if (aiAutoCompleteBtn) {
    aiAutoCompleteBtn.onclick = handleManualAIAutoComplete;
  }
}

async function handleAISubmit() {
  const inputEl = document.getElementById('ai-input-words');
  const tagsEl = document.getElementById('ai-input-tags');
  const inputWords = inputEl ? inputEl.value.trim() : '';

  if (!inputWords) {
    showToast('請輸入想學習的單字、片語或句子', 'warning');
    return;
  }

  const tags = tagsEl && tagsEl.value.trim() 
    ? tagsEl.value.split(/[,，、;]/).map(t => t.trim()).filter(Boolean)
    : ['AI新增'];

  const btn = document.getElementById('btn-ai-submit');
  const spinner = document.getElementById('ai-spinner');
  btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const newWords = await gemini.analyzeWordOrList(inputWords, tags);
    
    // 合併至目前單字庫
    let addedCount = 0;
    newWords.forEach(nw => {
      // 若已存在則更新，不存在則新增
      const existingIdx = app.words.findIndex(w => w.word.toLowerCase() === nw.word.toLowerCase());
      if (existingIdx >= 0) {
        app.words[existingIdx] = { ...app.words[existingIdx], ...nw };
      } else {
        app.words.unshift(nw);
      }
      addedCount++;
    });

    app.saveWords();
    sound.playSuccess();
    showToast(`太棒了！成功加入 ${addedCount} 個單字到單字庫！`, 'success');
    if (inputEl) inputEl.value = '';
    
    // 導向單字庫或直接查看
    setTimeout(() => {
      switchView('wordbank');
    }, 800);
  } catch (err) {
    showToast(err.message || 'AI 解析失敗，請檢查 API Key 是否正確。', 'error');
  } finally {
    btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function handleThemeSubmit() {
  const themeTopic = document.getElementById('theme-input-topic')?.value.trim();
  const count = parseInt(document.getElementById('theme-input-count')?.value || '5');

  if (!themeTopic) {
    showToast('請輸入想要的情境主題（例如：星巴克點餐、商務簡報）', 'warning');
    return;
  }

  const btn = document.getElementById('btn-theme-submit');
  const spinner = document.getElementById('theme-spinner');
  btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const generated = await gemini.generateThemeWords(themeTopic, count);
    let added = 0;
    generated.forEach(item => {
      const wObj = {
        id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        word: item.word,
        phonetic: item.phonetic || '',
        partOfSpeech: item.partOfSpeech || '',
        definition: item.definition || '',
        example_en: item.example_en || '',
        example_zh: item.example_zh || '',
        mnemonic: item.mnemonic || '',
        tags: item.tags?.length ? item.tags : [themeTopic],
        createdAt: new Date().toISOString(),
        srs: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 0 }
      };
      app.words.unshift(wObj);
      added++;
    });

    app.saveWords();
    sound.playFanfare();
    showToast(`成功為主題「${themeTopic}」生成 ${added} 個核心單字！`, 'success');
    setTimeout(() => switchView('wordbank'), 1000);
  } catch (err) {
    showToast(err.message || '情境生成失敗，請檢查 API Key 設定。', 'error');
  } finally {
    btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function handleManualAIAutoComplete() {
  const word = document.getElementById('manual-word')?.value.trim();
  if (!word) {
    showToast('請先輸入單字！', 'warning');
    return;
  }

  const btn = document.getElementById('btn-manual-ai-fill');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> AI 補全中...`;
  lucide.createIcons({ root: btn });

  try {
    const results = await gemini.analyzeWordOrList(word);
    if (results && results[0]) {
      const res = results[0];
      if (res.phonetic) document.getElementById('manual-phonetic').value = res.phonetic;
      if (res.partOfSpeech) document.getElementById('manual-pos').value = res.partOfSpeech;
      if (res.definition) document.getElementById('manual-def').value = res.definition;
      if (res.example_en) document.getElementById('manual-example-en').value = res.example_en;
      if (res.example_zh) document.getElementById('manual-example-zh').value = res.example_zh;
      if (res.mnemonic) document.getElementById('manual-mnemonic').value = res.mnemonic;
      if (res.tags?.length) document.getElementById('manual-tags').value = res.tags.join(', ');
      sound.playSuccess();
      showToast('AI 已自動補齊音標、例句與口訣！', 'success');
    }
  } catch (err) {
    showToast(err.message || 'AI 補全失敗', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> AI 幫我補全剩餘欄位`;
    lucide.createIcons({ root: btn });
  }
}

function handleManualSubmit() {
  const word = document.getElementById('manual-word')?.value.trim();
  const def = document.getElementById('manual-def')?.value.trim();

  if (!word || !def) {
    showToast('單字與中文定義為必填！', 'warning');
    return;
  }

  const tagsRaw = document.getElementById('manual-tags')?.value || '';
  const tags = tagsRaw.split(/[,，、;]/).map(t => t.trim()).filter(Boolean);

  const newWord = {
    id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    word,
    phonetic: document.getElementById('manual-phonetic')?.value.trim() || '',
    partOfSpeech: document.getElementById('manual-pos')?.value.trim() || '',
    definition: def,
    example_en: document.getElementById('manual-example-en')?.value.trim() || '',
    example_zh: document.getElementById('manual-example-zh')?.value.trim() || '',
    mnemonic: document.getElementById('manual-mnemonic')?.value.trim() || '',
    tags: tags.length ? tags : ['自訂'],
    createdAt: new Date().toISOString(),
    srs: {
      repetitions: 0,
      interval: 1,
      easeFactor: 2.5,
      nextReviewDate: new Date().toISOString().split('T')[0],
      masteryLevel: 0
    }
  };

  app.words.unshift(newWord);
  app.saveWords();
  sound.playSuccess();
  showToast(`已成功手動新增「${word}」！`, 'success');

  // 清空手動表單
  ['manual-word', 'manual-phonetic', 'manual-pos', 'manual-def', 'manual-example-en', 'manual-example-zh', 'manual-mnemonic', 'manual-tags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  setTimeout(() => switchView('wordbank'), 600);
}

// ==================== 12. 翻卡測試 (Flashcard SRS) ====================
function initFlashcardMode() {
  // 找出今日需複習的單字；若無，則採用所有單字打亂複習
  let queue = app.words.filter(w => SRSService.isDue(w));
  const isAllMode = queue.length === 0;

  if (isAllMode) {
    queue = [...app.words].sort(() => Math.random() - 0.5);
  }

  app.flashcardList = queue;
  app.flashcardIndex = 0;
  app.isCardFlipped = false;

  const modeBadge = document.getElementById('flashcard-mode-badge');
  if (modeBadge) {
    modeBadge.textContent = isAllMode ? '自由練習模式 (全單字庫)' : '今日 SRS 複習任務';
    modeBadge.className = isAllMode
      ? 'px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
      : 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300';
  }

  renderCurrentFlashcard();
}

function renderCurrentFlashcard() {
  const cardElement = document.getElementById('flashcard-element');
  const finishedContainer = document.getElementById('flashcard-finished');
  const cardContainer = document.getElementById('flashcard-container');

  if (!cardElement) return;

  if (app.flashcardList.length === 0 || app.flashcardIndex >= app.flashcardList.length) {
    // 複習完成！
    cardContainer?.classList.add('hidden');
    finishedContainer?.classList.remove('hidden');
    sound.playFanfare();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    app.recordStudyToday();
    return;
  }

  cardContainer?.classList.remove('hidden');
  finishedContainer?.classList.add('hidden');

  const word = app.flashcardList[app.flashcardIndex];
  app.isCardFlipped = false;
  cardElement.classList.remove('flipped');

  // 更新進度
  const progressEl = document.getElementById('flashcard-progress-text');
  const progressBar = document.getElementById('flashcard-progress-bar');
  if (progressEl) progressEl.textContent = `${app.flashcardIndex + 1} / ${app.flashcardList.length}`;
  if (progressBar) {
    const pct = Math.round(((app.flashcardIndex + 1) / app.flashcardList.length) * 100);
    progressBar.style.width = `${pct}%`;
  }

  // 正面內容
  document.getElementById('fc-front-word').textContent = word.word;
  document.getElementById('fc-front-pos').textContent = word.partOfSpeech || '';
  document.getElementById('fc-front-phonetic').textContent = word.phonetic || '';
  document.getElementById('fc-front-tags').innerHTML = (word.tags || []).map(t => `<span class="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">#${t}</span>`).join('');

  // 背面內容
  document.getElementById('fc-back-word').textContent = word.word;
  document.getElementById('fc-back-pos').textContent = word.partOfSpeech || '';
  document.getElementById('fc-back-phonetic').textContent = word.phonetic || '';
  document.getElementById('fc-back-definition').textContent = word.definition || '';
  document.getElementById('fc-back-example-en').textContent = word.example_en || '';
  document.getElementById('fc-back-example-zh').textContent = word.example_zh || '';
  
  const mnemonicBox = document.getElementById('fc-back-mnemonic-box');
  const mnemonicText = document.getElementById('fc-back-mnemonic');
  if (word.mnemonic) {
    mnemonicBox?.classList.remove('hidden');
    if (mnemonicText) mnemonicText.textContent = word.mnemonic;
  } else {
    mnemonicBox?.classList.add('hidden');
  }

  // 自動發音
  if (app.settings.autoPlayAudio) {
    setTimeout(() => {
      tts.speak(word.word);
    }, 200);
  }
}

function flipFlashcard() {
  const cardElement = document.getElementById('flashcard-element');
  if (!cardElement) return;
  sound.playFlip();
  app.isCardFlipped = !app.isCardFlipped;
  if (app.isCardFlipped) {
    cardElement.classList.add('flipped');
  } else {
    cardElement.classList.remove('flipped');
  }
}

function submitSRSGrade(grade) {
  if (app.flashcardList.length === 0 || app.flashcardIndex >= app.flashcardList.length) return;
  const currentWord = app.flashcardList[app.flashcardIndex];

  // 計算新的 SRS 狀態
  const newSRS = SRSService.calculate(currentWord, grade);
  
  // 更新至全局單字庫
  const globalIdx = app.words.findIndex(w => w.id === currentWord.id);
  if (globalIdx !== -1) {
    app.words[globalIdx].srs = newSRS;
    app.saveWords();
  }

  // 音效
  if (grade >= 3) {
    sound.playSuccess();
  } else {
    sound.playFlip();
  }

  app.flashcardIndex++;
  renderCurrentFlashcard();
}

// ==================== 13. 拼字練習 (Spelling Quiz) ====================
function initSpellingMode() {
  // 打亂所有單字作為測驗題庫
  app.spellingList = [...app.words].sort(() => Math.random() - 0.5);
  app.spellingIndex = 0;
  app.spellingCombo = 0;
  app.spellingScore = 0;

  renderCurrentSpelling();
}

function renderCurrentSpelling() {
  const card = document.getElementById('spelling-card');
  const finished = document.getElementById('spelling-finished');
  if (!card) return;

  if (app.spellingList.length === 0 || app.spellingIndex >= app.spellingList.length) {
    card.classList.add('hidden');
    finished?.classList.remove('hidden');
    sound.playFanfare();
    confetti({ particleCount: 120, spread: 80 });
    document.getElementById('spelling-final-score').textContent = app.spellingScore;
    document.getElementById('spelling-final-combo').textContent = app.spellingCombo;
    app.recordStudyToday();
    return;
  }

  card.classList.remove('hidden');
  finished?.classList.add('hidden');

  const word = app.spellingList[app.spellingIndex];

  // 更新計數與 Combo
  document.getElementById('spelling-progress').textContent = `${app.spellingIndex + 1} / ${app.spellingList.length}`;
  document.getElementById('spelling-combo-count').textContent = app.spellingCombo;
  document.getElementById('spelling-score-display').textContent = app.spellingScore;

  // 提示定義與詞性
  document.getElementById('spelling-def-prompt').textContent = word.definition || '請拼出對應單字';
  document.getElementById('spelling-pos-prompt').textContent = word.partOfSpeech || '';
  
  // 遮罩提示長度
  const maskLength = word.word.replace(/\s+/g, ' ').length;
  document.getElementById('spelling-hint-mask').textContent = `字數：${maskLength} 個字母 (${word.word.split(' ').map(w => '_ '.repeat(w.length).trim()).join('   ')})`;

  // 重設輸入框與結果提示
  const input = document.getElementById('spelling-input');
  const feedback = document.getElementById('spelling-feedback');
  if (input) {
    input.value = '';
    input.disabled = false;
    input.focus();
  }
  if (feedback) {
    feedback.innerHTML = '';
    feedback.className = 'text-center h-8 font-semibold text-sm transition-all';
  }

  // 播放發音
  tts.speak(word.word);
}

function checkSpelling() {
  const input = document.getElementById('spelling-input');
  const feedback = document.getElementById('spelling-feedback');
  const word = app.spellingList[app.spellingIndex];
  if (!input || !word) return;

  const userAns = input.value.trim().toLowerCase();
  const correctAns = word.word.trim().toLowerCase();

  if (userAns === correctAns) {
    // 答對了！
    sound.playSuccess();
    app.spellingCombo += 1;
    app.spellingScore += (10 + app.spellingCombo * 2);
    
    // 更新 SRS 答對良好
    const globalIdx = app.words.findIndex(w => w.id === word.id);
    if (globalIdx !== -1) {
      app.words[globalIdx].srs = SRSService.calculate(word, 3);
      app.saveWords();
    }

    feedback.className = 'text-center h-8 font-bold text-emerald-600 dark:text-emerald-400 animate-bounce';
    feedback.innerHTML = `🎉 答對了！ ${word.word} (${word.phonetic || ''}) +${10 + app.spellingCombo * 2} 分！`;
    input.disabled = true;

    setTimeout(() => {
      app.spellingIndex++;
      renderCurrentSpelling();
    }, 1100);
  } else {
    // 答錯
    sound.playError();
    app.spellingCombo = 0;
    
    // 震動動畫
    const card = document.getElementById('spelling-card');
    card.classList.add('animate-shake');
    setTimeout(() => card.classList.remove('animate-shake'), 400);

    feedback.className = 'text-center h-8 font-bold text-rose-600 dark:text-rose-400';
    feedback.innerHTML = `❌ 正確答案是：<span class="underline text-indigo-600 dark:text-indigo-400 text-lg">${word.word}</span>`;

    // SRS 判定 Again
    const globalIdx = app.words.findIndex(w => w.id === word.id);
    if (globalIdx !== -1) {
      app.words[globalIdx].srs = SRSService.calculate(word, 1);
      app.saveWords();
    }

    input.disabled = true;
    setTimeout(() => {
      app.spellingIndex++;
      renderCurrentSpelling();
    }, 2200);
  }
}

function revealSpellingHint() {
  const word = app.spellingList[app.spellingIndex];
  if (!word) return;
  const input = document.getElementById('spelling-input');
  if (input && !input.value) {
    input.value = word.word[0]; // 填入首字母
  }
  showToast(`首字母為「${word.word[0].toUpperCase()}」，音標：${word.phonetic || '無'}`, 'info');
  tts.speak(word.word);
}

// ==================== 14. 超乎預期功能：AI 實戰造句與故事生成 ====================
function initAILabView() {
  // 填入所有單字至造句選單
  const select = document.getElementById('sentence-word-select');
  if (select) {
    select.innerHTML = app.words.map(w => `<option value="${w.word}">${w.word} — ${w.definition || ''}</option>`).join('');
  }

  // 句子送出審核按鈕
  const gradeBtn = document.getElementById('btn-grade-sentence');
  if (gradeBtn) {
    gradeBtn.onclick = handleGradeSentence;
  }

  // 故事生成按鈕
  const storyBtn = document.getElementById('btn-generate-story');
  if (storyBtn) {
    storyBtn.onclick = handleGenerateStory;
  }
}

async function handleGradeSentence() {
  const word = document.getElementById('sentence-word-select')?.value;
  const sentence = document.getElementById('sentence-user-input')?.value.trim();

  if (!sentence) {
    showToast('請先輸入您造的英文句子！', 'warning');
    return;
  }

  const btn = document.getElementById('btn-grade-sentence');
  const spinner = document.getElementById('sentence-spinner');
  const resultCard = document.getElementById('sentence-result-card');

  btn.disabled = true;
  spinner?.classList.remove('hidden');

  try {
    const feedback = await gemini.gradeSentence(word, sentence);
    resultCard?.classList.remove('hidden');
    sound.playSuccess();

    document.getElementById('sr-score').textContent = `${feedback.score} 分`;
    document.getElementById('sr-grammar').textContent = feedback.grammarFeedback || '文法無明顯問題';
    document.getElementById('sr-natural').textContent = feedback.naturalFeedback || '用詞得體';
    document.getElementById('sr-better').textContent = feedback.betterVersion || sentence;
    document.getElementById('sr-encouragement').textContent = feedback.encouragement || '繼續保持！';

    // 播放地道修飾版本
    const speakBetterBtn = document.getElementById('sr-btn-speak-better');
    if (speakBetterBtn) {
      speakBetterBtn.onclick = () => tts.speak(feedback.betterVersion);
    }
  } catch (err) {
    showToast(err.message || 'AI 評估失敗，請檢查 API Key 設定。', 'error');
  } finally {
    btn.disabled = false;
    spinner?.classList.add('hidden');
  }
}

async function handleGenerateStory() {
  // 隨機抽選 4~6 個單字或優先選取今日待複習單字
  const due = app.words.filter(w => SRSService.isDue(w));
  let sampleWords = due.length >= 3 ? due.slice(0, 5) : app.words.slice(0, 6);
  if (sampleWords.length < 2) {
    showToast('單字庫至少需要 2 個單字才能生成故事喔！', 'warning');
    return;
  }

  const wordList = sampleWords.map(w => w.word);

  const btn = document.getElementById('btn-generate-story');
  const spinner = document.getElementById('story-spinner');
  const storyCard = document.getElementById('story-result-card');

  btn.disabled = true;
  spinner?.classList.remove('hidden');

  try {
    const storyData = await gemini.generateStory(wordList);
    storyCard?.classList.remove('hidden');
    sound.playFanfare();

    document.getElementById('story-title-en').textContent = storyData.title_en;
    document.getElementById('story-title-zh').textContent = storyData.title_zh;
    document.getElementById('story-text-en').innerHTML = storyData.story_en;
    document.getElementById('story-text-zh').textContent = storyData.story_zh;
    document.getElementById('story-takeaway').textContent = `💡 ${storyData.takeaway || ''}`;

    const speakStoryBtn = document.getElementById('story-btn-speak');
    if (speakStoryBtn) {
      // 朗讀前去除 HTML 標籤
      const cleanText = storyData.story_en.replace(/<[^>]*>/g, '');
      speakStoryBtn.onclick = () => tts.speak(cleanText);
    }
  } catch (err) {
    showToast(err.message || '故事生成失敗，請確認 API Key。', 'error');
  } finally {
    btn.disabled = false;
    spinner?.classList.add('hidden');
  }
}

// ==================== 15. CSV 匯出與匯入資料中心 ====================
function renderDataView() {
  // 匯出 CSV 按鈕
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (app.words.length === 0) {
        showToast('目前單字庫空空如也，無法匯出！', 'warning');
        return;
      }
      CSVService.exportToCSV(app.words);
      sound.playSuccess();
      showToast('已成功匯出繁體中文 UTF-8 CSV 檔案！', 'success');
    };
  }

  // 匯入 CSV 檔案選取
  const fileInput = document.getElementById('csv-file-input');
  const dropZone = document.getElementById('csv-drop-zone');
  const previewCard = document.getElementById('csv-preview-card');
  const confirmBtn = document.getElementById('btn-confirm-import');

  let pendingWords = [];

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      pendingWords = CSVService.parseCSV(text);

      if (pendingWords.length === 0) {
        showToast('CSV 格式解析為空或無有效資料！', 'error');
        return;
      }

      previewCard?.classList.remove('hidden');
      document.getElementById('csv-preview-count').textContent = `成功解析出 ${pendingWords.length} 個單字`;
      
      const tbody = document.getElementById('csv-preview-tbody');
      if (tbody) {
        tbody.innerHTML = pendingWords.slice(0, 5).map(w => `
          <tr class="border-b border-gray-100 dark:border-gray-800 text-xs">
            <td class="p-2 font-bold text-gray-900 dark:text-gray-100">${w.word}</td>
            <td class="p-2 text-gray-500">${w.partOfSpeech || '-'}</td>
            <td class="p-2 text-gray-700 dark:text-gray-300">${w.definition || '-'}</td>
            <td class="p-2 text-gray-500">${(w.tags || []).join(', ')}</td>
          </tr>
        `).join('');
      }
      showToast(`已載入 ${pendingWords.length} 個單字預覽`, 'info');
    };
    reader.readAsText(file, 'UTF-8');
  };

  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      handleFile(file);
    };
  }

  if (dropZone) {
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add('border-indigo-500', 'bg-indigo-50/50');
    };
    dropZone.ondragleave = () => {
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    };
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (pendingWords.length === 0) return;
      const mode = document.querySelector('input[name="import-mode"]:checked')?.value || 'merge';

      if (mode === 'overwrite') {
        app.words = pendingWords;
      } else {
        // 合併 (以單字小寫為鍵去重或更新)
        pendingWords.forEach(pw => {
          const idx = app.words.findIndex(w => w.word.toLowerCase() === pw.word.toLowerCase());
          if (idx >= 0) {
            app.words[idx] = { ...app.words[idx], ...pw };
          } else {
            app.words.push(pw);
          }
        });
      }

      app.saveWords();
      sound.playFanfare();
      showToast(`🎉 成功匯入 ${pendingWords.length} 個單字！`, 'success');
      previewCard?.classList.add('hidden');
      if (fileInput) fileInput.value = '';
      setTimeout(() => switchView('wordbank'), 800);
    };
  }

  // 下載範例 CSV
  const sampleBtn = document.getElementById('btn-download-sample-csv');
  if (sampleBtn) {
    sampleBtn.onclick = () => {
      CSVService.exportToCSV(app.getDefaultWords());
      showToast('範例 CSV 下載完成！', 'info');
    };
  }

  // 完整 JSON 備份與還原
  const exportJsonBtn = document.getElementById('btn-export-json');
  if (exportJsonBtn) {
    exportJsonBtn.onclick = () => {
      const backupData = {
        words: app.words,
        settings: app.settings,
        streak: app.streak,
        version: '1.0',
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echovocab_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('完整備份 JSON 已下載', 'success');
    };
  }
}

// ==================== 16. 設定 Modal 與全域快捷鍵 ====================
function setupSettingsModal() {
  const openBtn = document.getElementById('btn-open-settings');
  const closeBtn = document.getElementById('btn-close-settings');
  const saveBtn = document.getElementById('btn-save-settings');
  const modal = document.getElementById('settings-modal');

  const apiKeyInput = document.getElementById('settings-api-key');
  const modelSelect = document.getElementById('settings-model');
  const rateInput = document.getElementById('settings-voice-rate');
  const rateDisplay = document.getElementById('settings-voice-rate-val');
  const voiceSelect = document.getElementById('settings-voice-select');
  const autoPlayCheck = document.getElementById('settings-autoplay-audio');
  const darkCheck = document.getElementById('settings-dark-mode');

  const fillInputs = () => {
    if (apiKeyInput) apiKeyInput.value = app.settings.apiKey || '';
    if (modelSelect) modelSelect.value = app.settings.model || 'gemini-1.5-flash';
    if (rateInput) rateInput.value = app.settings.speechRate || 1.0;
    if (rateDisplay) rateDisplay.textContent = `${app.settings.speechRate || 1.0}x`;
    if (autoPlayCheck) autoPlayCheck.checked = !!app.settings.autoPlayAudio;
    if (darkCheck) darkCheck.checked = !!app.settings.darkMode;

    // 填充語音清單
    if (voiceSelect) {
      voiceSelect.innerHTML = tts.voices.map(v => `
        <option value="${v.voiceURI}" ${v.voiceURI === app.settings.voiceURI ? 'selected' : ''}>
          ${v.name} (${v.lang})
        </option>
      `).join('');
    }
  };

  if (openBtn) {
    openBtn.onclick = () => {
      fillInputs();
      modal?.classList.remove('hidden');
      lucide.createIcons({ root: modal });
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => modal?.classList.add('hidden');
  }

  if (rateInput && rateDisplay) {
    rateInput.oninput = (e) => {
      rateDisplay.textContent = `${e.target.value}x`;
    };
  }

  // 測試發音
  const testVoiceBtn = document.getElementById('btn-test-voice');
  if (testVoiceBtn) {
    testVoiceBtn.onclick = () => {
      const selectedURI = voiceSelect?.value;
      const rate = parseFloat(rateInput?.value || '1.0');
      tts.selectedVoiceURI = selectedURI;
      tts.rate = rate;
      tts.speak('Hello! Welcome to EchoVocab, your AI-powered English journey.');
    };
  }

  // 測試 API Key
  const testApiBtn = document.getElementById('btn-test-api');
  if (testApiBtn) {
    testApiBtn.onclick = async () => {
      const key = apiKeyInput?.value.trim();
      if (!key) {
        showToast('請先輸入 API Key', 'warning');
        return;
      }
      testApiBtn.disabled = true;
      testApiBtn.textContent = '測試連線中...';
      try {
        const testGemini = new GeminiService(key, modelSelect?.value || 'gemini-1.5-flash');
        const res = await testGemini.callGemini('Reply with only one word: Connected');
        sound.playSuccess();
        showToast(`Gemini API 連線成功！回應: ${res.trim()}`, 'success');
      } catch (err) {
        showToast(`連線失敗: ${err.message}`, 'error');
      } finally {
        testApiBtn.disabled = false;
        testApiBtn.textContent = '測試連線';
      }
    };
  }

  if (saveBtn) {
    saveBtn.onclick = () => {
      app.settings.apiKey = apiKeyInput?.value.trim() || '';
      app.settings.model = modelSelect?.value || 'gemini-1.5-flash';
      app.settings.speechRate = parseFloat(rateInput?.value || '1.0');
      app.settings.voiceURI = voiceSelect?.value || '';
      app.settings.autoPlayAudio = !!autoPlayCheck?.checked;
      app.settings.darkMode = !!darkCheck?.checked;

      app.saveSettings();
      gemini.setApiKey(app.settings.apiKey);
      gemini.setModel(app.settings.model);
      tts.rate = app.settings.speechRate;
      tts.selectedVoiceURI = app.settings.voiceURI;
      applyTheme(app.settings.darkMode);

      modal?.classList.add('hidden');
      sound.playSuccess();
      showToast('設定已儲存！', 'success');
    };
  }

  // 載入預設單字按鈕
  const resetDefaultBtn = document.getElementById('btn-reset-default-words');
  if (resetDefaultBtn) {
    resetDefaultBtn.onclick = () => {
      if (confirm('確定要載入官方精選示範單字包嗎？（不會清除你自訂的單字）')) {
        const defaults = app.getDefaultWords();
        defaults.forEach(d => {
          if (!app.words.some(w => w.word.toLowerCase() === d.word.toLowerCase())) {
            app.words.push(d);
          }
        });
        app.saveWords();
        showToast('已成功匯入精選示範單字！', 'success');
        renderWordBank();
      }
    };
  }
}

// 全域快捷鍵
function setupGlobalShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 若在輸入框內打字則不觸發單鍵快捷鍵
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      if (e.key === 'Enter' && document.activeElement.id === 'spelling-input') {
        checkSpelling();
      }
      return;
    }

    if (app.currentView === 'flashcard') {
      if (e.code === 'Space') {
        e.preventDefault();
        flipFlashcard();
      } else if (e.key === '1') {
        submitSRSGrade(1);
      } else if (e.key === '2') {
        submitSRSGrade(2);
      } else if (e.key === '3') {
        submitSRSGrade(3);
      } else if (e.key === '4') {
        submitSRSGrade(4);
      } else if (e.key.toLowerCase() === 'r') {
        const currentWord = app.flashcardList[app.flashcardIndex];
        if (currentWord) tts.speak(currentWord.word);
      }
    }
  });
}
