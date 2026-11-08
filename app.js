/**
 * EchoVocab 靈語單字 - 智慧個性化背英文系統
 * 全功能客戶端核心腳本
 */

function safeConfetti(opts) {
  try {
    if (typeof confetti === 'function') confetti(opts);
  } catch (e) {}
}
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
    if (!app.settings.soundEffects) return;
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
    if (!app.settings.soundEffects) return;
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
    if (!app.settings.soundEffects) return;
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
    if (!app.settings.soundEffects) return;
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
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

function extractRobustJSON(rawText) {
  if (!rawText) throw new Error('AI 未回傳任何內容');

  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. 嘗試直接解析
  try {
    return JSON.parse(cleaned);
  } catch (e1) {}

  // 2. 嘗試抓取 [ ... ] 陣列
  const startArr = cleaned.indexOf('[');
  const endArr = cleaned.lastIndexOf(']');
  if (startArr !== -1 && endArr > startArr) {
    const candidate = cleaned.slice(startArr, endArr + 1);
    try {
      return JSON.parse(candidate);
    } catch (e2) {}
  }

  // 3. 嘗試抓取 { ... } 物件
  const startObj = cleaned.indexOf('{');
  const endObj = cleaned.lastIndexOf('}');
  if (startObj !== -1 && endObj > startObj) {
    const candidate = cleaned.slice(startObj, endObj + 1);
    try {
      return JSON.parse(candidate);
    } catch (e3) {}
  }

  // 4. 清除尾端多餘逗號嘗試
  try {
    const fixed = cleaned.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(fixed);
  } catch (e4) {}

  throw new Error('AI 回傳內容未能成功解析為 JSON，請重試一次');
}

class GeminiService {
  constructor(apiKey = '', model = DEFAULT_GEMINI_MODEL) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_GEMINI_MODEL;
  }

  setApiKey(key) {
    this.apiKey = key ? key.trim() : '';
  }

  setModel(model) {
    this.model = model?.trim() || DEFAULT_GEMINI_MODEL;
  }

  async callGemini(prompt, systemInstruction = '') {
    if (!this.apiKey) {
      throw new Error('NO_API_KEY');
    }

    let modelName = (this.model || DEFAULT_GEMINI_MODEL).trim();
    if (modelName.startsWith('models/')) {
      modelName = modelName.slice(7);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey.trim()}`;
    
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

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
    } catch (netErr) {
      throw new Error(`網路連線異常，無法連線至 Google 伺服器 (${netErr.message})`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const rawMsg = err.error?.message || `HTTP ${response.status}`;

      if (response.status === 400 && rawMsg.includes('API_KEY_INVALID')) {
        throw new Error('API Key 無效，請檢查是否有複製到多餘空白');
      } else if (response.status === 404 || rawMsg.includes('not found') || rawMsg.includes('no longer available')) {
        throw new Error(`模型「${modelName}」目前無法使用，請至右上角設定選擇可用的 Gemini 模型，例如「${DEFAULT_GEMINI_MODEL}」`);
      } else if (response.status === 429) {
        throw new Error(`Gemini API 暫時受限（${rawMsg}）。請檢查 Google AI Studio 的配額與帳單狀態，或稍後重試。`);
      }
      throw new Error(`AI 請求失敗: ${rawMsg}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const responseText = candidate?.content?.parts
      ?.map(part => part.text)
      .filter(Boolean)
      .join('\n');
    if (!responseText) {
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini 因安全政策未處理此請求（${data.promptFeedback.blockReason}）`);
      }
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Gemini 未能完成回應（${candidate.finishReason}）`);
      }
      throw new Error('Gemini API 未回傳有效文字內容');
    }

    return responseText;
  }

  // 1.5 圖片/截圖 OCR 多模態提取生詞
  async extractWordsFromImage(base64Image, mimeType = 'image/jpeg') {
    if (!this.apiKey) {
      throw new Error('NO_API_KEY');
    }

    let modelName = (this.model || DEFAULT_GEMINI_MODEL).trim();
    if (modelName.startsWith('models/')) modelName = modelName.slice(7);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey.trim()}`;
    
    const prompt = `請識別並提取這張圖片中的重要英文生字或重點高級單字（提取約 3~8 個最有學習價值的單字）。
為每個單字生成學習卡片 JSON 陣列，欄位包含：word, phonetic, partOfSpeech, definition (繁體中文), example_en, example_zh, mnemonic, tags。
嚴格規定：只回傳純 JSON 陣列，不要有任何 Markdown 註記。`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image.split(',')[1] || base64Image
              }
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `圖片辨識失敗 (HTTP ${response.status})`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      throw new Error('Gemini 未回傳有效辨識結果');
    }

    const parsed = extractRobustJSON(candidate.content.parts[0].text);
    return this.mapToWordObjects(parsed, ['圖片提取']);
  }

  // 1. 單字或片語智慧解析
  async analyzeWordOrList(inputWords, targetTags = ['AI擴充']) {
    try {
      const prompt = `你是一位專業的英文教學大師。使用者輸入了以下內容（可能是單字、片語、句子或想學習的中文主題）：
"${inputWords}"

請提取或整理出 1 到 6 個最值得學習的核心英文生詞，為每個單字提供完整的繁體中文學習資料：
- word: 正確英文原型單字或片語
- phonetic: 國際音標 (IPA)，例如 /ˌserənˈdɪpəti/
- partOfSpeech: 詞性縮寫，例如 n., v., adj., adv., phrase
- definition: 準確簡潔的繁體中文釋義
- example_en: 1句實用且地道的英文例句
- example_zh: 繁體中文例句翻譯
- mnemonic: 超有趣的記憶聯想法（諧音梗、字根字首或趣味口訣，幫助秒記）
- tags: 推薦的分類標籤陣列，例如 ["生活英語", "職場"]

重要規定：你必須只回傳一個合法的 JSON 陣列，不得包含任何 Markdown 格式或額外說明。格式：
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

      const text = await this.callGemini(prompt, '你只回傳合法的 JSON 陣列，嚴禁任何其他非 JSON 文字。');
      const parsed = extractRobustJSON(text);
      if (!Array.isArray(parsed)) {
        throw new Error('AI 未能回傳單字清單陣列');
      }
      return this.mapToWordObjects(parsed, targetTags);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：尚未設定 API Key，已為您生成本機模擬智慧卡片。可至右上角 ⚙️ 設定填入 Gemini Key！', 'info');
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
      word: item.word || 'Word',
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
      const prompt = `請針對生活/職場主題「${themeTopic}」，挑選 ${count} 個最實用、最核心的高頻英文單字或地道片語。
請以繁體中文輸出完整的學習卡片 JSON 陣列，欄位包含 word, phonetic, partOfSpeech, definition, example_en, example_zh, mnemonic, tags。
重要：只回傳嚴格合法的 JSON 陣列，不輸出任何其他開場白。`;
      const text = await this.callGemini(prompt, '只回傳嚴格合法的 JSON 陣列。');
      return extractRobustJSON(text);
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
  "score": 85,
  "isCorrect": true,
  "grammarFeedback": "文法與時態分析說明...",
  "naturalFeedback": "道地程度與母語者用詞習慣說明...",
  "betterVersion": "母語人士更道地自然的修飾版本句子",
  "encouragement": "溫暖且具體的鼓勵話語"
}
只輸出純 JSON，不要附加任何 Markdown 標記。`;

      const text = await this.callGemini(prompt, '只回傳嚴格合法的 JSON 物件。');
      return extractRobustJSON(text);
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
2. 故事要有情節畫面感，提供流暢優美的繁體中文全文翻譯。

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
      return extractRobustJSON(text);
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('💡 提示：示範情境短文（填入 Gemini API Key 享受無限 AI 創作故事）', 'info');
        return {
          title_en: 'A Spark of Inspiration',
          title_zh: '靈光乍現的一天',
          story_en: `It was a morning of pure <b>${wordsList[0] || 'serendipity'}</b> when Alex had a sudden <b>${wordsList[1] || 'epiphany'}</b> about his career journey.`,
          story_zh: `這是一個純粹幸運的早晨，亞歷克斯突然靈光乍現，領悟了人生的方向。`,
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
      model: DEFAULT_GEMINI_MODEL,
      voiceURI: '',
      speechRate: 1.0,
      soundEffects: true,
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
        // 若含有舊版的預設初始單字，自動清除保持乾淨空白
        if (Array.isArray(this.words) && this.words.every(w => w.id && w.id.startsWith('w_init_'))) {
          this.words = [];
          this.saveWords();
        }
      } else {
        // 完全空白，不預載任何預設資料
        this.words = [];
        this.saveWords();
      }

      const storedSettings = localStorage.getItem('echovocab_settings_v1');
      if (storedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(storedSettings) };
        const retiredModels = [
          'gemini-1.5-flash',
          'gemini-1.5-flash-8b',
          'gemini-1.5-pro',
          'gemini-2.0-flash',
          'gemini-2.0-flash-lite',
          'gemini-2.5-flash',
          'gemini-2.5-pro'
        ];
        if (!this.settings.model || retiredModels.includes(this.settings.model)) {
          this.settings.model = DEFAULT_GEMINI_MODEL;
          this.saveSettings();
        }
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
      this.words = [];
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
    return [];
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
  setupFirebaseAuth();
  setupGlobalShortcuts();
  switchView(app.currentView);

  // 激勵每日金句
  renderQuote();
});

function setupFirebaseAuth() {
  const status = document.getElementById('cloud-auth-status');
  const syncStatus = document.getElementById('cloud-sync-status');
  const signInButton = document.getElementById('btn-google-sign-in');
  const accountMenu = document.getElementById('google-account-menu');
  const accountMenuToggle = document.getElementById('google-account-menu-toggle');
  const accountDropdown = document.getElementById('google-account-dropdown');
  const signOutButton = document.getElementById('btn-google-sign-out');
  const cloudSettingsButton = document.getElementById('btn-cloud-settings');
  const userAvatar = document.getElementById('google-user-avatar');
  const userAvatarFallback = document.getElementById('google-user-avatar-fallback');
  const userName = document.getElementById('google-user-name');
  const syncButton = document.getElementById('btn-cloud-sync');
  const syncActions = document.getElementById('cloud-sync-actions');
  const uploadButton = document.getElementById('btn-cloud-upload');
  const downloadButton = document.getElementById('btn-cloud-download');
  const mergeButton = document.getElementById('btn-cloud-merge');
  let currentUser = null;
  let cloudHasData = false;

  const closeAccountMenu = () => {
    accountDropdown?.classList.add('hidden');
    accountMenuToggle?.setAttribute('aria-expanded', 'false');
  };

  const toggleAccountMenu = () => {
    const isExpanded = accountMenuToggle?.getAttribute('aria-expanded') === 'true';
    accountDropdown?.classList.toggle('hidden', isExpanded);
    accountMenuToggle?.setAttribute('aria-expanded', String(!isExpanded));
  };

  const updateStatus = (user) => {
    currentUser = user;
    cloudHasData = false;
    if (syncActions) syncActions.classList.add('hidden');
    if (downloadButton) downloadButton.disabled = true;
    if (mergeButton) mergeButton.disabled = true;
    if (user) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'Google 帳號';
      if (status) status.textContent = `已登入：${user.displayName || user.email || 'Google 帳號'}`;
      if (userName) {
        userName.textContent = displayName;
        userName.title = displayName;
      }
      if (user.photoURL && userAvatar) {
        userAvatar.src = user.photoURL;
        userAvatar.alt = `${displayName} 的 Google 頭像`;
        userAvatar.classList.remove('hidden');
        userAvatarFallback?.classList.add('hidden');
        userAvatar.onerror = () => {
          userAvatar.classList.add('hidden');
          userAvatarFallback?.classList.remove('hidden');
        };
      } else {
        userAvatar?.classList.add('hidden');
        userAvatarFallback?.classList.remove('hidden');
      }
      signInButton?.classList.add('hidden');
      accountMenu?.classList.remove('hidden');
      if (syncButton) syncButton.disabled = false;
      if (syncStatus) syncStatus.textContent = '已登入。按「檢查雲端資料」後，選擇本機／雲端資料的處理方式。';
    } else {
      if (status) status.textContent = '尚未登入 Google 帳號。';
      signInButton?.classList.remove('hidden');
      accountMenu?.classList.add('hidden');
      closeAccountMenu();
      userAvatar?.classList.add('hidden');
      userAvatarFallback?.classList.remove('hidden');
      if (syncButton) syncButton.disabled = true;
      if (syncActions) syncActions.classList.add('hidden');
      if (syncStatus) syncStatus.textContent = '登入後可手動同步單字與學習打卡；Gemini API Key 不會上傳。';
    }
  };

  const readCloudData = async () => {
    const data = await window.firebaseCloud.getUserData(currentUser.uid);
    if (data === null) return null;
    if (
      !Array.isArray(data.words) ||
      data.words.some((word) => !word || typeof word.id !== 'string') ||
      !data.streak ||
      typeof data.streak !== 'object' ||
      (data.streak.lastStudyDate !== undefined && typeof data.streak.lastStudyDate !== 'string')
    ) {
      throw new Error('雲端資料格式不正確，為保護資料已停止同步。');
    }
    return data;
  };

  const setBusy = (busy) => {
    [syncButton, uploadButton, downloadButton, mergeButton].forEach((button) => {
      if (button) button.disabled = busy || (button === syncButton ? !currentUser : !cloudHasData && button !== uploadButton);
    });
  };

  const withSyncError = async (operation, successMessage) => {
    if (!currentUser) {
      showToast('請先登入 Google 帳號。', 'warning');
      return;
    }

    setBusy(true);
    if (syncStatus) syncStatus.textContent = '同步處理中…';
    try {
      await operation();
      if (syncStatus) syncStatus.textContent = successMessage;
      if (syncActions) syncActions.classList.add('hidden');
      showToast(successMessage, 'success');
    } catch (error) {
      console.error('雲端同步失敗', error);
      const message = error.code === 'permission-denied'
        ? 'Firestore 拒絕存取，請確認已發布允許 users/{uid}/data/{doc} 的規則。'
        : `雲端同步失敗：${error.message}`;
      if (syncStatus) syncStatus.textContent = message;
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const localData = () => ({
    words: app.words,
    streak: {
      streak: app.streak,
      lastStudyDate: app.lastStudyDate
    }
  });

  const replaceLocalData = (data) => {
    app.words = data.words;
    app.streak = Number.isFinite(data.streak.streak) ? data.streak.streak : 1;
    app.lastStudyDate = typeof data.streak.lastStudyDate === 'string' ? data.streak.lastStudyDate : '';
    app.saveWords();
    app.saveStreak();
    renderCurrentView();
  };

  const uploadLocalData = () => withSyncError(async () => {
    await window.firebaseCloud.setUserData(currentUser.uid, localData());
    cloudHasData = true;
  }, '已將本機單字與打卡資料上傳到雲端。');

  const downloadCloudData = () => withSyncError(async () => {
    const data = await readCloudData();
    if (!data) throw new Error('找不到雲端資料，請先上傳或合併本機資料。');
    replaceLocalData(data);
  }, '已用雲端資料取代本機單字與打卡資料。');

  const mergeData = () => withSyncError(async () => {
    const cloudData = await readCloudData();
    if (!cloudData) throw new Error('找不到雲端資料，請先上傳本機資料。');
    const mergedWords = new Map(app.words.map((word) => [word.id, word]));
    cloudData.words.forEach((word) => mergedWords.set(word.id, word));
    const localStreak = localData().streak;
    const mergedStreak = cloudData.streak.lastStudyDate >= localStreak.lastStudyDate
      ? cloudData.streak
      : localStreak;
    const merged = { words: [...mergedWords.values()], streak: mergedStreak };
    replaceLocalData(merged);
    await window.firebaseCloud.setUserData(currentUser.uid, merged);
    cloudHasData = true;
  }, '已合併本機與雲端資料（相同 ID 的單字以雲端版本為準）。');

  const connectAuth = () => {
    if (window.firebaseCloudError) {
      if (status) status.textContent = `Firebase 初始化失敗：${window.firebaseCloudError.message}`;
      if (signInButton) signInButton.disabled = true;
      return;
    }

    if (!window.firebaseCloud) {
      if (status) status.textContent = 'Firebase 載入中，請稍後重試。';
      return;
    }

    window.firebaseCloud.onAuthStateChanged(updateStatus, (error) => {
      if (status) status.textContent = `無法取得登入狀態：${error.message}`;
      showToast(`Google 登入狀態錯誤：${error.message}`, 'error');
    });
  };

  window.addEventListener('firebase-cloud-ready', connectAuth, { once: true });

  if (window.firebaseCloud || window.firebaseCloudError) {
    connectAuth();
  }

  if (signInButton) {
    signInButton.onclick = async () => {
      if (!window.firebaseCloud) {
        showToast('Firebase 尚未載入，請確認網路連線後重新整理頁面。', 'error');
        return;
      }

      signInButton.disabled = true;
      try {
        await window.firebaseCloud.signInWithGoogle();
      } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
          showToast(`Google 登入失敗：${error.message}`, 'error');
        }
      } finally {
        signInButton.disabled = false;
      }
    };
  }

  if (signOutButton) {
    signOutButton.onclick = async () => {
      closeAccountMenu();
      try {
        await window.firebaseCloud.signOut();
        showToast('已登出 Google 帳號。', 'info');
      } catch (error) {
        showToast(`Google 登出失敗：${error.message}`, 'error');
      }
    };
  }

  if (accountMenuToggle) accountMenuToggle.onclick = toggleAccountMenu;

  if (accountMenu) {
    document.addEventListener('click', (event) => {
      if (!accountMenu.contains(event.target)) closeAccountMenu();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAccountMenu();
  });

  if (cloudSettingsButton) {
    cloudSettingsButton.onclick = () => {
      closeAccountMenu();
      document.getElementById('btn-open-settings')?.click();
      window.setTimeout(() => {
        document.getElementById('cloud-settings-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
  }

  if (syncButton) {
    syncButton.onclick = async () => {
      if (!currentUser) {
        showToast('請先登入 Google 帳號。', 'warning');
        return;
      }

      setBusy(true);
      if (syncStatus) syncStatus.textContent = '正在檢查雲端資料…';
      try {
        const data = await readCloudData();
        cloudHasData = data !== null;
        if (downloadButton) downloadButton.disabled = !cloudHasData;
        if (mergeButton) mergeButton.disabled = !cloudHasData;
        if (syncActions) syncActions.classList.remove('hidden');
        if (syncStatus) {
          const localWordCount = app.words.length;
          syncStatus.textContent = cloudHasData
            ? `本機 ${localWordCount} 個、雲端 ${data.words.length} 個單字。請選擇上傳、下載或合併。`
            : `本機有 ${localWordCount} 個單字，雲端尚無資料。可先上傳本機資料。`;
        }
      } catch (error) {
        console.error('讀取雲端資料失敗', error);
        const message = error.code === 'permission-denied'
          ? 'Firestore 拒絕存取，請確認已發布允許 users/{uid}/data/{doc} 的規則。'
          : `讀取雲端資料失敗：${error.message}`;
        if (syncStatus) syncStatus.textContent = message;
        showToast(message, 'error');
      } finally {
        setBusy(false);
      }
    };
  }

  if (uploadButton) uploadButton.onclick = uploadLocalData;
  if (downloadButton) downloadButton.onclick = downloadCloudData;
  if (mergeButton) mergeButton.onclick = mergeData;
}

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

  const validViews = new Set(
    [...document.querySelectorAll('.app-view')]
      .map(view => view.id.replace(/^view-/, ''))
  );
  const initialView = window.location.hash.slice(1);
  app.currentView = validViews.has(initialView) ? initialView : 'dashboard';
  const initialHash = `#${app.currentView}`;
  if (window.location.hash !== initialHash) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${initialHash}`);
  }

  window.addEventListener('hashchange', () => {
    const requestedView = window.location.hash.slice(1);
    switchView(validViews.has(requestedView) ? requestedView : 'dashboard');
  });
}

function switchView(viewName) {
  const viewExists = document.getElementById(`view-${viewName}`);
  if (!viewExists) return;

  const nextHash = `#${viewName}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${nextHash}`);
  }

  app.currentView = viewName;
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => v.classList.add('hidden'));

  viewExists.classList.remove('hidden');

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
    case 'listening':
      initListeningMode();
      break;
    case 'ai-lab':
      initAILabView();
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
  const ocrTabBtn = document.getElementById('tab-btn-ocr');
  const manualTabBtn = document.getElementById('tab-btn-manual');
  const themeTabBtn = document.getElementById('tab-btn-theme');

  const aiSection = document.getElementById('section-ai-add');
  const ocrSection = document.getElementById('section-ocr-add');
  const manualSection = document.getElementById('section-manual-add');
  const themeSection = document.getElementById('section-theme-add');

  let currentOcrBase64 = '';
  let currentOcrMime = 'image/jpeg';

  const switchTab = (tab) => {
    [aiSection, ocrSection, manualSection, themeSection].forEach(s => s?.classList.add('hidden'));
    [aiTabBtn, ocrTabBtn, manualTabBtn, themeTabBtn].forEach(b => b?.classList.remove('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400'));

    if (tab === 'ai') {
      aiSection?.classList.remove('hidden');
      aiTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    } else if (tab === 'ocr') {
      ocrSection?.classList.remove('hidden');
      ocrTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    } else if (tab === 'manual') {
      manualSection?.classList.remove('hidden');
      manualTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    } else if (tab === 'theme') {
      themeSection?.classList.remove('hidden');
      themeTabBtn?.classList.add('active-tab', 'border-b-2', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400');
    }
  };

  if (aiTabBtn) aiTabBtn.onclick = () => switchTab('ai');
  if (ocrTabBtn) ocrTabBtn.onclick = () => switchTab('ocr');
  if (manualTabBtn) manualTabBtn.onclick = () => switchTab('manual');
  if (themeTabBtn) themeTabBtn.onclick = () => switchTab('theme');

  // OCR 圖片處理
  const handleOcrFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('請選擇有效的圖片檔案', 'warning');
      return;
    }
    currentOcrMime = file.type;
    const reader = new FileReader();
    reader.onload = (e) => {
      currentOcrBase64 = e.target.result;
      const previewImg = document.getElementById('ocr-preview-img');
      const previewContainer = document.getElementById('ocr-preview-container');
      const placeholder = document.getElementById('ocr-placeholder');
      if (previewImg) previewImg.src = currentOcrBase64;
      previewContainer?.classList.remove('hidden');
      placeholder?.classList.add('hidden');
      showToast('圖片已載入，點擊辨識按鈕即可提取單字！', 'info');
    };
    reader.readAsDataURL(file);
  };

  const ocrFileInput = document.getElementById('ocr-file-input');
  if (ocrFileInput) {
    ocrFileInput.onchange = (e) => handleOcrFile(e.target.files[0]);
  }

  // 支援全域 Ctrl+V 貼上圖片
  window.addEventListener('paste', (e) => {
    if (app.currentView !== 'add') return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        switchTab('ocr');
        handleOcrFile(blob);
        break;
      }
    }
  });

  const ocrSubmitBtn = document.getElementById('btn-ocr-submit');
  if (ocrSubmitBtn) {
    ocrSubmitBtn.onclick = async () => {
      if (!currentOcrBase64) {
        showToast('請先上傳或貼上圖片！', 'warning');
        return;
      }
      ocrSubmitBtn.disabled = true;
      const spinner = document.getElementById('ocr-spinner');
      spinner?.classList.remove('hidden');

      try {
        const words = await gemini.extractWordsFromImage(currentOcrBase64, currentOcrMime);
        words.forEach(w => {
          const idx = app.words.findIndex(existing => existing.word.toLowerCase() === w.word.toLowerCase());
          if (idx >= 0) {
            app.words[idx] = { ...app.words[idx], ...w };
          } else {
            app.words.unshift(w);
          }
        });
        app.saveWords();
        sound.playFanfare();
        showToast(`🎉 成功從圖片中識別並提取 ${words.length} 個生字！`, 'success');
        setTimeout(() => switchView('wordbank'), 800);
      } catch (err) {
        showToast(err.message || '圖片辨識失敗，請檢查 API Key 設定。', 'error');
      } finally {
        ocrSubmitBtn.disabled = false;
        spinner?.classList.add('hidden');
      }
    };
  }

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
  const cardContainer = document.getElementById('flashcard-container');
  const finishedContainer = document.getElementById('flashcard-finished');
  const srsButtons = document.getElementById('flashcard-srs-buttons');

  if (app.words.length === 0) {
    cardContainer?.classList.add('hidden');
    srsButtons?.classList.add('hidden');
    if (finishedContainer) {
      finishedContainer.classList.remove('hidden');
      finishedContainer.innerHTML = `
        <div class="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mx-auto text-2xl">
          <i data-lucide="inbox" class="w-8 h-8"></i>
        </div>
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">單字庫目前空空如也</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">尚未新增任何單字。您可以透過 Gemini AI、情境產生、手動錄入或 CSV 匯入來建立專屬的單字清單！</p>
        <div class="pt-2 flex justify-center gap-3">
          <button onclick="switchView('add')" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5">
            <i data-lucide="plus" class="w-4 h-4"></i> 前往新增單字
          </button>
          <button onclick="document.getElementById('btn-open-settings').click()" class="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入 CSV
          </button>
        </div>
      `;
      lucide.createIcons({ root: finishedContainer });
    }
    return;
  }

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

  cardContainer?.classList.remove('hidden');
  srsButtons?.classList.remove('hidden');
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
    safeConfetti({
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
  const card = document.getElementById('spelling-card');
  const finished = document.getElementById('spelling-finished');

  if (app.words.length === 0) {
    card?.classList.add('hidden');
    if (finished) {
      finished.classList.remove('hidden');
      finished.innerHTML = `
        <div class="w-16 h-16 rounded-3xl bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center mx-auto text-2xl">
          <i data-lucide="spell-check" class="w-8 h-8"></i>
        </div>
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">單字庫目前是空的</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">請先透過 Gemini AI 或 CSV 匯入新增單字，才能進行拼字盲打挑戰喔！</p>
        <div class="pt-2 flex justify-center gap-3">
          <button onclick="switchView('add')" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5">
            <i data-lucide="plus" class="w-4 h-4"></i> 前往新增單字
          </button>
        </div>
      `;
      lucide.createIcons({ root: finished });
    }
    return;
  }

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
    safeConfetti({ particleCount: 120, spread: 80 });
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
}

// ==================== 13.5 聽力盲測模式 (Listening Challenge) ====================
let listeningList = [];
let listeningIndex = 0;
let listeningCombo = 0;

function initListeningMode() {
  const card = document.getElementById('listening-card');
  const finished = document.getElementById('listening-finished');

  if (app.words.length < 4) {
    card?.classList.add('hidden');
    if (finished) {
      finished.classList.remove('hidden');
      finished.innerHTML = `
        <div class="w-16 h-16 rounded-3xl bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center mx-auto text-2xl">
          <i data-lucide="headphones" class="w-8 h-8"></i>
        </div>
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">需要至少 4 個單字</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">聽力四選一盲測需要至少 4 個單字來產生選擇題選項，請先新增單字或匯入 CSV 喔！</p>
        <div class="pt-2 flex justify-center gap-3">
          <button onclick="switchView('add')" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5">
            <i data-lucide="plus" class="w-4 h-4"></i> 前往新增單字
          </button>
        </div>
      `;
      lucide.createIcons({ root: finished });
    }
    return;
  }

  listeningList = [...app.words].sort(() => Math.random() - 0.5);
  listeningIndex = 0;
  listeningCombo = 0;

  card?.classList.remove('hidden');
  finished?.classList.add('hidden');

  renderCurrentListening();
}

function renderCurrentListening() {
  const card = document.getElementById('listening-card');
  const finished = document.getElementById('listening-finished');
  const optionsContainer = document.getElementById('listening-options');
  const revealBox = document.getElementById('listening-reveal');

  if (listeningIndex >= listeningList.length) {
    card?.classList.add('hidden');
    finished?.classList.remove('hidden');
    sound.playFanfare();
    safeConfetti({ particleCount: 100, spread: 70 });
    app.recordStudyToday();
    return;
  }

  revealBox?.classList.add('hidden');
  document.getElementById('listening-progress').textContent = `${listeningIndex + 1} / ${listeningList.length}`;
  document.getElementById('listening-combo').textContent = listeningCombo;

  const currentWord = listeningList[listeningIndex];

  // 播放發音
  playListeningAudio();

  // 挑選 3 個干擾選項
  const others = app.words.filter(w => w.id !== currentWord.id);
  const shuffledOthers = others.sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [currentWord, ...shuffledOthers].sort(() => Math.random() - 0.5);

  if (optionsContainer) {
    optionsContainer.innerHTML = options.map((opt, idx) => `
      <button onclick="checkListeningAnswer('${opt.id}', this)" class="listening-option-btn w-full p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 text-left text-sm font-semibold transition flex items-center justify-between shadow-sm">
        <span class="text-slate-800 dark:text-slate-200">${opt.definition || opt.word}</span>
        <span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 font-mono">${idx + 1}</span>
      </button>
    `).join('');
  }
}

function playListeningAudio() {
  const currentWord = listeningList[listeningIndex];
  if (currentWord) {
    tts.speak(currentWord.word);
  }
}

function checkListeningAnswer(selectedId, btnEl) {
  const currentWord = listeningList[listeningIndex];
  const allBtns = document.querySelectorAll('.listening-option-btn');
  allBtns.forEach(b => b.disabled = true);

  const revealBox = document.getElementById('listening-reveal');

  if (selectedId === currentWord.id) {
    // 答對
    sound.playSuccess();
    listeningCombo++;
    document.getElementById('listening-combo').textContent = listeningCombo;
    btnEl.classList.remove('bg-white/70', 'dark:bg-slate-800/70');
    btnEl.classList.add('bg-emerald-500', 'text-white', 'border-emerald-600');

    if (revealBox) {
      revealBox.className = 'text-center p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-sm font-bold block';
      revealBox.innerHTML = `🎉 答對了！單字是：<span class="text-lg font-black underline">${currentWord.word}</span> ${currentWord.phonetic || ''}`;
    }

    setTimeout(() => {
      listeningIndex++;
      renderCurrentListening();
    }, 1200);
  } else {
    // 答錯
    sound.playError();
    listeningCombo = 0;
    document.getElementById('listening-combo').textContent = listeningCombo;
    btnEl.classList.add('bg-rose-500', 'text-white', 'border-rose-600');

    if (revealBox) {
      revealBox.className = 'text-center p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-sm font-bold block';
      revealBox.innerHTML = `❌ 正確答案是：<span class="text-lg font-black underline">${currentWord.word}</span>（${currentWord.definition}）`;
    }

    setTimeout(() => {
      listeningIndex++;
      renderCurrentListening();
    }, 2000);
  }
}
function initAILabView() {
  const select = document.getElementById('sentence-word-select');
  const gradeBtn = document.getElementById('btn-grade-sentence');
  const storyBtn = document.getElementById('btn-generate-story');

  if (app.words.length === 0) {
    if (select) {
      select.innerHTML = '<option value="">（單字庫目前為空，請先新增單字）</option>';
      select.disabled = true;
    }
    if (gradeBtn) gradeBtn.disabled = true;
    if (storyBtn) storyBtn.disabled = true;
    return;
  }

  if (select) {
    select.disabled = false;
    select.innerHTML = app.words.map(w => `<option value="${w.word}">${w.word} — ${w.definition || ''}</option>`).join('');
  }
  if (gradeBtn) gradeBtn.disabled = false;
  if (storyBtn) storyBtn.disabled = false;

  // 句子送出審核按鈕
  if (gradeBtn) {
    gradeBtn.onclick = handleGradeSentence;
  }

  // 故事生成按鈕
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

// ==================== 16. 設定 Modal 與全域快捷鍵 ====================
function setupSettingsModal() {
  const openBtn = document.getElementById('btn-open-settings');
  const closeBtn = document.getElementById('btn-close-settings');
  const saveBtn = document.getElementById('btn-save-settings');
  const modal = document.getElementById('settings-modal');

  const apiKeyInput = document.getElementById('settings-api-key');
  const modelSelect = document.getElementById('settings-model');
  const customModelContainer = document.getElementById('custom-model-container');
  const customModelInput = document.getElementById('settings-custom-model');
  const rateInput = document.getElementById('settings-voice-rate');
  const rateDisplay = document.getElementById('settings-voice-rate-val');
  const voiceSelect = document.getElementById('settings-voice-select');
  const soundEffectsCheck = document.getElementById('settings-sound-effects');
  const darkCheck = document.getElementById('settings-dark-mode');

  // 模型下拉選單與自訂輸入連動
  if (modelSelect) {
    modelSelect.onchange = (e) => {
      if (e.target.value === 'custom') {
        customModelContainer?.classList.remove('hidden');
        customModelInput?.focus();
      } else {
        customModelContainer?.classList.add('hidden');
      }
    };
  }

  const fillInputs = () => {
    if (apiKeyInput) apiKeyInput.value = app.settings.apiKey || '';
    
    // 檢查目前儲存的模型是否在內建選項中
    const currentModel = app.settings.model || DEFAULT_GEMINI_MODEL;
    const builtInValues = [DEFAULT_GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    
    if (modelSelect) {
      if (builtInValues.includes(currentModel)) {
        modelSelect.value = currentModel;
        customModelContainer?.classList.add('hidden');
      } else {
        modelSelect.value = 'custom';
        customModelContainer?.classList.remove('hidden');
        if (customModelInput) customModelInput.value = currentModel;
      }
    }

    if (rateInput) rateInput.value = app.settings.speechRate || 1.0;
    if (rateDisplay) rateDisplay.textContent = `${app.settings.speechRate || 1.0}x`;
    if (soundEffectsCheck) soundEffectsCheck.checked = app.settings.soundEffects !== false;
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
      let targetModel = modelSelect?.value || DEFAULT_GEMINI_MODEL;
      if (targetModel === 'custom') {
        targetModel = customModelInput?.value.trim() || DEFAULT_GEMINI_MODEL;
      }

      try {
        const testGemini = new GeminiService(key, targetModel);
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
      let selectedModel = modelSelect?.value || DEFAULT_GEMINI_MODEL;
      if (selectedModel === 'custom') {
        selectedModel = customModelInput?.value.trim() || DEFAULT_GEMINI_MODEL;
      }

      app.settings.apiKey = apiKeyInput?.value.trim() || '';
      app.settings.model = selectedModel;
      app.settings.speechRate = parseFloat(rateInput?.value || '1.0');
      app.settings.voiceURI = voiceSelect?.value || '';
      app.settings.soundEffects = !!soundEffectsCheck?.checked;
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

  // ================= 設定中的資料管理 (CSV 匯入/匯出) =================
  const exportCsvBtn = document.getElementById('settings-btn-export-csv');
  if (exportCsvBtn) {
    exportCsvBtn.onclick = () => {
      if (app.words.length === 0) {
        showToast('目前單字庫空空如也，無法匯出！', 'warning');
        return;
      }
      CSVService.exportToCSV(app.words);
      sound.playSuccess();
      showToast('已成功匯出繁體中文 UTF-8 CSV 單字檔！', 'success');
    };
  }

  // 下載標準空白 CSV 範本 (純記憶體動態產生，目錄中不留任何實體檔案)
  const downloadTemplateBtn = document.getElementById('settings-btn-download-template');
  if (downloadTemplateBtn) {
    downloadTemplateBtn.onclick = () => {
      const headers = ['Word', 'Phonetic', 'PartOfSpeech', 'Definition', 'Example_EN', 'Example_ZH', 'Mnemonic', 'Tags'];
      const csvContent = '\uFEFF' + headers.join(',') + '\r\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'vocabulary_template.csv';
      link.click();
      URL.revokeObjectURL(url);
      showToast('已下載空白 CSV 範本！', 'info');
    };
  }

  // 列印 A4 單字小抄
  const printWordsBtn = document.getElementById('settings-btn-print-words');
  if (printWordsBtn) {
    printWordsBtn.onclick = () => {
      if (app.words.length === 0) {
        showToast('目前單字庫空空如也，請先新增單字再列印小抄喔！', 'warning');
        return;
      }
      const printGrid = document.getElementById('print-words-grid');
      const printDate = document.getElementById('print-date');
      if (printDate) printDate.textContent = `列印時間：${new Date().toLocaleDateString('zh-TW')} (共 ${app.words.length} 字)`;

      if (printGrid) {
        printGrid.innerHTML = app.words.map((w, idx) => `
          <div class="grid grid-cols-12 border-b border-gray-300 py-1.5 break-inside-avoid">
            <div class="col-span-5 pr-3">
              <span class="font-bold text-sm mr-1.5">${idx + 1}. ${w.word}</span>
              ${w.partOfSpeech ? `<span class="italic text-gray-600 font-serif mr-1">[${w.partOfSpeech}]</span>` : ''}
              ${w.phonetic ? `<span class="text-gray-500 font-mono text-[11px]">${w.phonetic}</span>` : ''}
            </div>
            <div class="col-span-1 text-center text-gray-300 select-none">|</div>
            <div class="col-span-6 pl-2">
              <div class="font-semibold text-gray-900">${w.definition || '-'}</div>
              ${w.example_en ? `<div class="text-gray-600 text-[10px] italic mt-0.5">${w.example_en}</div>` : ''}
              ${w.mnemonic ? `<div class="text-amber-800 text-[10px] mt-0.5">💡 口訣：${w.mnemonic}</div>` : ''}
            </div>
          </div>
        `).join('');
      }
      modal?.classList.add('hidden');
      window.print();
    };
  }

  // JSON 全量備份
  const exportJsonBtn = document.getElementById('settings-btn-export-json');
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

  // CSV 匯入處理
  const csvFileInput = document.getElementById('settings-csv-file-input');
  const previewBox = document.getElementById('settings-csv-preview');
  const confirmImportBtn = document.getElementById('settings-btn-confirm-import');
  let pendingImportWords = [];

  if (csvFileInput) {
    csvFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        pendingImportWords = CSVService.parseCSV(text);

        if (pendingImportWords.length === 0) {
          showToast('CSV 格式解析為空或無有效單字！', 'error');
          return;
        }

        previewBox?.classList.remove('hidden');
        document.getElementById('settings-preview-count').textContent = `成功解析出 ${pendingImportWords.length} 個單字`;
        
        const tbody = document.getElementById('settings-preview-tbody');
        if (tbody) {
          tbody.innerHTML = pendingImportWords.slice(0, 5).map(w => `
            <tr class="border-b border-slate-200 dark:border-slate-700">
              <td class="p-1 font-bold text-slate-800 dark:text-slate-100">${w.word}</td>
              <td class="p-1 text-slate-600 dark:text-slate-300 truncate max-w-[120px]">${w.definition || '-'}</td>
              <td class="p-1 text-slate-400">${(w.tags || []).join(', ')}</td>
            </tr>
          `).join('');
        }
        showToast(`已載入 ${pendingImportWords.length} 個單字預覽，請確認匯入方式`, 'info');
      };
      reader.readAsText(file, 'UTF-8');
    };
  }

  if (confirmImportBtn) {
    confirmImportBtn.onclick = () => {
      if (pendingImportWords.length === 0) return;
      const mode = document.querySelector('input[name="settings-import-mode"]:checked')?.value || 'merge';

      if (mode === 'overwrite') {
        app.words = pendingImportWords;
      } else {
        pendingImportWords.forEach(pw => {
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
      showToast(`🎉 成功匯入 ${pendingImportWords.length} 個單字！`, 'success');
      previewBox?.classList.add('hidden');
      if (csvFileInput) csvFileInput.value = '';
      modal?.classList.add('hidden');
      renderCurrentView();
    };
  }

  // 清空所有單字資料按鈕
  const clearAllBtn = document.getElementById('btn-clear-all-words');
  if (clearAllBtn) {
    clearAllBtn.onclick = () => {
      if (confirm('確定要清空目前所有的單字庫嗎？此操作無法撤銷！')) {
        app.words = [];
        app.saveWords();
        showToast('已清空所有單字庫資料，目前為純淨空白狀態。', 'info');
        renderCurrentView();
      }
    };
  }
}

// ==================== 18. 常見基礎詞庫版本按需導入 ====================
function importPresetVocab(type) {
  const presets = {
    daily: [
      { word: 'procrastinate', phonetic: '/prəʊˈkræstɪneɪt/', partOfSpeech: 'v.', definition: '拖延；推遲', example_en: 'Don’t procrastinate on your daily study!', example_zh: '別再拖延你每日的學習了！', mnemonic: 'pro(前)+cras(明天)->永遠拖到明天', tags: ['生活日常', '習慣'] },
      { word: 'spontaneous', phonetic: '/spɒnˈteɪniəs/', partOfSpeech: 'adj.', definition: '自發的；隨性的；非籌劃的', example_en: 'We took a spontaneous road trip on the weekend.', example_zh: '我們週末來了一場說走就走的公路旅行。', mnemonic: '諧音「死奔騰」->隨性奔放，自然而然', tags: ['生活日常', '性格'] },
      { word: 'commute', phonetic: '/kəˈmjuːt/', partOfSpeech: 'v./n.', definition: '通勤；上下班路程', example_en: 'It takes 40 minutes to commute to work.', example_zh: '通勤上班需要花費 40 分鐘。', mnemonic: 'com(共同)+mute(改變)->每天共同變換地點', tags: ['生活日常', '通勤'] },
      { word: 'beverage', phonetic: '/ˈbevərɪdʒ/', partOfSpeech: 'n.', definition: '飲料 (尤指水以外的飲品)', example_en: 'Hot beverages will be served after the meal.', example_zh: '餐後將供應熱飲。', mnemonic: 'beer(啤酒)+average(平均)->生活常喝的飲料', tags: ['生活日常', '飲食'] }
    ],
    toeic: [
      { word: 'collaborate', phonetic: '/kəˈlæbəreɪt/', partOfSpeech: 'v.', definition: '合作；協作', example_en: 'Our teams collaborate closely on international projects.', example_zh: '我們的團隊在跨國專案上緊密合作。', mnemonic: 'col(共同)+labor(勞動)->一起工作就是合作', tags: ['多益必備', '職場'] },
      { word: 'negotiate', phonetic: '/nɪˈɡəʊʃieɪt/', partOfSpeech: 'v.', definition: '協商；談判', example_en: 'We successfully negotiated a better contract price.', example_zh: '我們成功談判爭取到更好的合約價格。', mnemonic: 'neg(否定)+otium(閒暇)->工作不閒著，積極談判', tags: ['多益必備', '商務'] },
      { word: 'eligible', phonetic: '/ˈelɪdʒəbl/', partOfSpeech: 'adj.', definition: '有資格的；符合條件的', example_en: 'Employees who pass probation are eligible for the bonus.', example_zh: '通過試用期的員工有資格獲得獎金。', mnemonic: 'elect(選出)+able(能)->能被選中的，就是合格的', tags: ['多益必備', '人事'] },
      { word: 'reimburse', phonetic: '/ˌriːɪmˈbɜːs/', partOfSpeech: 'v.', definition: '核銷；報銷；償還', example_en: 'The company will reimburse your travel expenses.', example_zh: '公司將報銷你的差旅費用。', mnemonic: 're(再)+in(進)+purse(錢包)->錢重新回到錢包，就是報銷', tags: ['多益必備', '財務'] }
    ],
    travel: [
      { word: 'itinerary', phonetic: '/aɪˈtɪnərəri/', partOfSpeech: 'n.', definition: '旅行行程；行程表', example_en: 'Please review our flight and hotel itinerary.', example_zh: '請檢視我們的航班與飯店行程表。', mnemonic: '諧音「愛聽你的」->行程規劃愛聽你的意見', tags: ['出國旅遊', '行程'] },
      { word: 'boarding', phonetic: '/ˈbɔːdɪŋ/', partOfSpeech: 'n.', definition: '登機；登船', example_en: 'Boarding for Flight 302 will commence shortly.', example_zh: '302 號航班即將開始登機。', mnemonic: 'board(甲板/登機牌)->登上飛機', tags: ['出國旅遊', '機場'] },
      { word: 'souvenir', phonetic: '/ˌsuːvəˈnɪə/', partOfSpeech: 'n.', definition: '紀念品；伴手禮', example_en: 'I bought a handcrafted souvenir for my friend.', example_zh: '我為朋友買了一件手工紀念品。', mnemonic: 'sou(手)+venir(到來)->帶到手邊的回憶物品', tags: ['出國旅遊', '購物'] },
      { word: 'accommodation', phonetic: '/əˌkɒməˈdeɪʃn/', partOfSpeech: 'n.', definition: '住宿；膳宿', example_en: 'We booked luxury hotel accommodation in downtown Tokyo.', example_zh: '我們在東京市中心預訂了豪華飯店住宿。', mnemonic: 'ac(加強)+commod(合適/便利)->給予旅人舒適安歇的住所', tags: ['出國旅遊', '住宿'] }
    ]
  };

  const list = presets[type];
  if (!list) return;

  let added = 0;
  list.forEach(item => {
    const exists = app.words.some(w => w.word.toLowerCase() === item.word.toLowerCase());
    if (!exists) {
      app.words.push({
        id: 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        ...item,
        createdAt: new Date().toISOString(),
        srs: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewDate: new Date().toISOString().split('T')[0], masteryLevel: 0 }
      });
      added++;
    }
  });

  app.saveWords();
  sound.playFanfare();
  showToast(`🎉 成功導入 ${added} 個精選單字！`, 'success');
  
  const modal = document.getElementById('settings-modal');
  modal?.classList.add('hidden');
  renderCurrentView();
}
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
