'use strict';

const STORAGE_KEYS = {
  profiles: 'sensismart_ff_profiles_v1',
  lastSession: 'sensismart_ff_last_session_v1'
};

const sensitivityMetadata = {
  general: {
    label: 'Geral',
    description: 'Controla a velocidade principal da câmera e a subida inicial da mira.',
    max: 200,
    unit: ''
  },
  redDot: {
    label: 'Ponto vermelho',
    description: 'Ajusta a resposta da mira em combates próximos e puxadas rápidas.',
    max: 200,
    unit: ''
  },
  scope2x: {
    label: 'Mira 2x',
    description: 'Equilibra velocidade e controle em curtas e médias distâncias.',
    max: 200,
    unit: ''
  },
  scope4x: {
    label: 'Mira 4x',
    description: 'Prioriza estabilidade para médias e longas distâncias.',
    max: 200,
    unit: ''
  },
  awm: {
    label: 'Mira AWM',
    description: 'Mantém a mira de sniper precisa, evitando movimentos excessivos.',
    max: 200,
    unit: ''
  },
  freeLook: {
    label: 'Câmera livre',
    description: 'Define a velocidade para observar o ambiente sem alterar a direção do personagem.',
    max: 200,
    unit: ''
  },
  fireButton: {
    label: 'Botão de disparo',
    description: 'Tamanho sugerido para facilitar o arraste sem ocupar área excessiva da tela.',
    max: 100,
    unit: '%'
  }
};

const baseProfiles = {
  low: { general: 150, redDot: 170, scope2x: 178, scope4x: 158, awm: 118, freeLook: 108, fireButton: 49 },
  intermediate: { general: 141, redDot: 162, scope2x: 173, scope4x: 155, awm: 120, freeLook: 102, fireButton: 48 },
  advanced: { general: 136, redDot: 156, scope2x: 166, scope4x: 149, awm: 116, freeLook: 99, fireButton: 47 },
  high: { general: 130, redDot: 148, scope2x: 158, scope4x: 143, awm: 112, freeLook: 96, fireButton: 46 }
};

const appState = {
  detected: {},
  benchmark: { score: 0, label: 'Não executado', operationsPerMs: 0 },
  deviceData: null,
  classification: null,
  recommended: null,
  current: null,
  calibrated: null,
  explanation: [],
  report: {},
  installPrompt: null
};

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

const elements = {
  startAnalysisButton: $('#startAnalysisButton'),
  openProfilesButton: $('#openProfilesButton'),
  closeProfilesButton: $('#closeProfilesButton'),
  installButton: $('#installButton'),
  analysisSection: $('#analysisSection'),
  resultSection: $('#resultSection'),
  calibrationSection: $('#calibrationSection'),
  comparisonSection: $('#comparisonSection'),
  profilesSection: $('#profilesSection'),
  detectedDataList: $('#detectedDataList'),
  benchmarkScore: $('#benchmarkScore'),
  benchmarkLabel: $('#benchmarkLabel'),
  benchmarkBar: $('#benchmarkBar'),
  analysisProgress: $('#analysisProgress'),
  deviceForm: $('#deviceForm'),
  calibrationForm: $('#calibrationForm'),
  formError: $('#formError'),
  sensitivityCards: $('#sensitivityCards'),
  performanceClassBadge: $('#performanceClassBadge'),
  resultSubtitle: $('#resultSubtitle'),
  recommendationExplanation: $('#recommendationExplanation'),
  technicalReport: $('#technicalReport'),
  comparisonTable: $('#comparisonTable'),
  profilesList: $('#profilesList'),
  toast: $('#toast'),
  connectionStatus: $('#connectionStatus')
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
}

function normalizeDecimalInput(value) {
  if (typeof value !== 'string') return Number(value) || 0;
  return Number(value.replace(',', '.')) || 0;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function showSection(section) {
  [elements.analysisSection, elements.resultSection, elements.calibrationSection, elements.comparisonSection, elements.profilesSection]
    .forEach(item => item.classList.add('hidden'));
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function detectOperatingSystem() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';

  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s([\d.]+)/i);
    return `Android${match ? ` ${match[1]}` : ''}`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS / iPadOS';
  if (/Windows/i.test(platform) || /Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'Linux';
  return 'Não identificado';
}

function detectBrowser() {
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser\//.test(ua)) return 'Samsung Internet';
  if (/Chrome\//.test(ua)) return 'Google Chrome';
  if (/Firefox\//.test(ua)) return 'Mozilla Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Navegador não identificado';
}

function detectDeviceType() {
  const ua = navigator.userAgent || '';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (/mobi|android/i.test(ua) || navigator.maxTouchPoints > 1) return 'Celular / dispositivo móvel';
  return 'Computador';
}

function getOrientationLabel() {
  if (screen.orientation?.type) {
    return screen.orientation.type.includes('portrait') ? 'Retrato' : 'Paisagem';
  }
  return window.innerHeight >= window.innerWidth ? 'Retrato' : 'Paisagem';
}

async function estimateRefreshRate() {
  if (!('requestAnimationFrame' in window)) return null;

  return new Promise(resolve => {
    const samples = [];
    let previous = performance.now();
    let frames = 0;

    const collect = now => {
      const delta = now - previous;
      previous = now;
      if (delta > 4 && delta < 40) samples.push(delta);
      frames += 1;

      if (frames < 50) {
        requestAnimationFrame(collect);
        return;
      }

      if (!samples.length) {
        resolve(null);
        return;
      }

      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];
      const rawHz = 1000 / median;
      const commonRates = [60, 75, 90, 120, 144, 165];
      const nearest = commonRates.reduce((best, current) =>
        Math.abs(current - rawHz) < Math.abs(best - rawHz) ? current : best
      );
      resolve(nearest);
    };

    requestAnimationFrame(collect);
  });
}

async function runLightBenchmark() {
  await new Promise(resolve => setTimeout(resolve, 30));
  const iterations = 700000;
  let accumulator = 0x12345678;
  const start = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    accumulator = Math.imul(accumulator ^ index, 2654435761) >>> 0;
    accumulator = (accumulator + ((index << 5) | (index >>> 3))) >>> 0;
  }

  const elapsed = Math.max(performance.now() - start, 1);
  const operationsPerMs = iterations / elapsed;
  let score;

  if (operationsPerMs < 5000) score = 25;
  else if (operationsPerMs < 9000) score = 42;
  else if (operationsPerMs < 15000) score = 58;
  else if (operationsPerMs < 23000) score = 74;
  else score = 90;

  if (navigator.hardwareConcurrency >= 8) score += 3;
  else if (navigator.hardwareConcurrency <= 4) score -= 3;

  score = clamp(score, 10, 100);
  const label = score < 35 ? 'Baixo' : score < 55 ? 'Moderado' : score < 75 ? 'Bom' : 'Muito bom';
  return { score, label, operationsPerMs: Math.round(operationsPerMs), checksum: accumulator };
}

function renderDetectedData() {
  const entries = [
    ['Sistema operacional', appState.detected.os],
    ['Tipo de dispositivo', appState.detected.deviceType],
    ['Navegador', appState.detected.browser],
    ['Tela física', `${appState.detected.screenWidth} × ${appState.detected.screenHeight}px`],
    ['Área visível', `${appState.detected.viewportWidth} × ${appState.detected.viewportHeight}px`],
    ['Densidade de pixels', `${formatNumber(appState.detected.devicePixelRatio, 2)}×`],
    ['Memória aproximada', appState.detected.memory ? `${appState.detected.memory} GB` : 'Não disponível'],
    ['Núcleos lógicos', appState.detected.cores || 'Não disponível'],
    ['Tela sensível ao toque', appState.detected.touch ? 'Sim' : 'Não'],
    ['Orientação', appState.detected.orientation],
    ['Atualização estimada', appState.detected.refreshRate ? `${appState.detected.refreshRate} Hz` : 'Não disponível']
  ];

  elements.detectedDataList.innerHTML = entries.map(([term, description]) => `
    <div>
      <dt>${escapeHtml(String(term))}</dt>
      <dd>${escapeHtml(String(description))}</dd>
    </div>
  `).join('');
}

async function analyzeDevice() {
  elements.analysisProgress.textContent = 'Detectando...';
  elements.benchmarkScore.textContent = '—';
  elements.benchmarkLabel.textContent = 'Executando teste';
  elements.benchmarkBar.style.width = '8%';

  appState.detected = {
    os: detectOperatingSystem(),
    deviceType: detectDeviceType(),
    browser: detectBrowser(),
    screenWidth: window.screen?.width || window.innerWidth,
    screenHeight: window.screen?.height || window.innerHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    memory: navigator.deviceMemory || null,
    cores: navigator.hardwareConcurrency || null,
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    orientation: getOrientationLabel(),
    refreshRate: null
  };

  renderDetectedData();

  const [refreshRate, benchmark] = await Promise.all([
    estimateRefreshRate().catch(() => null),
    runLightBenchmark().catch(() => ({ score: 50, label: 'Indisponível', operationsPerMs: 0 }))
  ]);

  appState.detected.refreshRate = refreshRate;
  appState.benchmark = benchmark;
  renderDetectedData();

  elements.benchmarkScore.textContent = String(benchmark.score);
  elements.benchmarkLabel.textContent = `${benchmark.label} • índice local`;
  elements.benchmarkBar.style.width = `${benchmark.score}%`;
  elements.analysisProgress.textContent = 'Concluído';

  prefillAvailableData();
}

function prefillAvailableData() {
  if (appState.detected.memory && !$('#ram').value) {
    const supportedRam = [2, 3, 4, 6, 8, 12, 16];
    const nearest = supportedRam.reduce((best, current) =>
      Math.abs(current - appState.detected.memory) < Math.abs(best - appState.detected.memory) ? current : best
    );
    $('#ram').value = String(nearest);
  }

  if (appState.detected.refreshRate && !$('#refreshRate').value) {
    const supportedRates = [60, 90, 120, 144];
    const nearest = supportedRates.reduce((best, current) =>
      Math.abs(current - appState.detected.refreshRate) < Math.abs(best - appState.detected.refreshRate) ? current : best
    );
    $('#refreshRate').value = String(nearest);
  }

  if (!$('#dpi').value && appState.detected.devicePixelRatio) {
    const estimatedDpi = clamp(160 * appState.detected.devicePixelRatio, 120, 1000);
    $('#dpi').value = String(estimatedDpi);
  }
}

function fillReferenceDevice() {
  $('#brand').value = 'Samsung';
  $('#model').value = 'Galaxy A14 5G (SM-A146M/DS)';
  $('#ram').value = '4';
  $('#refreshRate').value = '60';
  $('#dpi').value = '400';
  $('#screenProtector').value = 'none';
  $('#screenState').value = 'normal';
  $('#playStyle').value = 'balanced';
  $('#fingers').value = '2';
  $('#preference').value = 'medium';
  $('#currentProblem').value = 'none';
  $('#storageTotal').value = '128';
  $('#storageUsed').value = '99.4';
  showToast('Exemplo do Galaxy A14 preenchido.');
}

function validateDeviceForm() {
  const requiredFields = ['brand', 'model', 'ram', 'refreshRate', 'dpi', 'screenProtector', 'screenState', 'playStyle', 'fingers', 'preference', 'currentProblem'];
  let valid = true;
  let message = '';

  requiredFields.forEach(id => {
    const field = $(`#${id}`);
    field.classList.remove('invalid');
    if (!field.value.trim()) {
      field.classList.add('invalid');
      valid = false;
    }
  });

  const dpi = Number($('#dpi').value);
  if (!Number.isFinite(dpi) || dpi < 120 || dpi > 1000) {
    $('#dpi').classList.add('invalid');
    valid = false;
    message = 'Informe um DPI válido entre 120 e 1000.';
  }

  const storageTotal = normalizeDecimalInput($('#storageTotal').value);
  const storageUsed = normalizeDecimalInput($('#storageUsed').value);
  $('#storageTotal').classList.remove('invalid');
  $('#storageUsed').classList.remove('invalid');

  if (storageUsed > 0 && storageTotal <= 0) {
    $('#storageTotal').classList.add('invalid');
    valid = false;
    message = 'Informe o armazenamento total para usar o valor ocupado.';
  } else if (storageTotal > 0 && storageUsed > storageTotal) {
    $('#storageUsed').classList.add('invalid');
    valid = false;
    message = 'O armazenamento utilizado não pode ser maior que o total.';
  }

  if (!valid) {
    elements.formError.textContent = message || 'Preencha todos os campos obrigatórios.';
    elements.formError.classList.remove('hidden');
  } else {
    elements.formError.classList.add('hidden');
  }

  return valid;
}

function collectDeviceData() {
  const storageTotal = normalizeDecimalInput($('#storageTotal').value);
  const storageUsed = normalizeDecimalInput($('#storageUsed').value);
  const storageFreePercent = storageTotal > 0 ? ((storageTotal - storageUsed) / storageTotal) * 100 : null;

  return {
    brand: $('#brand').value.trim(),
    model: $('#model').value.trim(),
    ram: Number($('#ram').value),
    refreshRate: Number($('#refreshRate').value),
    dpi: Number($('#dpi').value),
    screenProtector: $('#screenProtector').value,
    screenState: $('#screenState').value,
    playStyle: $('#playStyle').value,
    fingers: Number($('#fingers').value),
    preference: $('#preference').value,
    currentProblem: $('#currentProblem').value,
    storageTotal,
    storageUsed,
    storageFreePercent,
    detected: deepClone(appState.detected),
    benchmark: deepClone(appState.benchmark)
  };
}

function classifyDevice(data) {
  let score = 0;
  const details = [];

  if (data.ram <= 3) { score += 0; details.push('RAM limitada'); }
  else if (data.ram === 4) { score += 1; details.push('4 GB de RAM'); }
  else if (data.ram <= 6) { score += 2; details.push('6 GB de RAM'); }
  else { score += 3; details.push('8 GB ou mais de RAM'); }

  const cores = data.detected.cores || 4;
  if (cores <= 4) score += 0;
  else if (cores <= 6) score += 1;
  else if (cores <= 8) score += 2;
  else score += 3;

  if (data.refreshRate === 60) score += 0;
  else if (data.refreshRate === 90) score += 1;
  else if (data.refreshRate === 120) score += 2;
  else score += 3;

  const pixels = (data.detected.screenWidth || 720) * (data.detected.screenHeight || 1600);
  if (pixels < 1300000) score += 0.5;
  else if (pixels < 2600000) score += 1;
  else score += 1.5;

  const benchmarkScore = data.benchmark.score || 50;
  if (benchmarkScore < 35) score += 0;
  else if (benchmarkScore < 55) score += 1;
  else if (benchmarkScore < 75) score += 2;
  else score += 3;

  if (data.storageFreePercent !== null) {
    if (data.storageFreePercent < 10) score -= 1;
    else if (data.storageFreePercent < 20) score -= 0.5;
    else if (data.storageFreePercent >= 40) score += 0.5;
  }

  let key;
  let label;
  if (score < 4) { key = 'low'; label = 'Baixo desempenho'; }
  else if (score < 7.5) { key = 'intermediate'; label = 'Intermediário'; }
  else if (score < 10.5) { key = 'advanced'; label = 'Intermediário avançado'; }
  else { key = 'high'; label = 'Alto desempenho'; }

  return { key, label, score: Number(score.toFixed(1)), details };
}

function applyDelta(config, keys, amount) {
  keys.forEach(key => {
    config[key] += amount;
  });
}

function calculateSensitivity(data, classification) {
  const config = deepClone(baseProfiles[classification.key]);
  const reasons = [];

  // Refresh rate: lower rates receive slightly faster values; high rates remain controlled.
  if (data.refreshRate === 60) {
    config.general += 4;
    config.redDot += 3;
    config.scope2x += 2;
    config.freeLook += 3;
    reasons.push('A tela de 60 Hz recebeu um pequeno aumento em Geral, Ponto vermelho e Câmera livre para compensar a resposta visual mais lenta.');
  } else if (data.refreshRate === 90) {
    config.general += 1;
    config.redDot += 1;
    reasons.push('A tela de 90 Hz permitiu um ajuste próximo do neutro, com leve ganho de resposta.');
  } else if (data.refreshRate >= 120) {
    config.general -= 3;
    config.redDot -= 3;
    config.scope2x -= 2;
    reasons.push('A alta taxa de atualização permitiu reduzir a sensibilidade para melhorar o controle fino.');
  }

  // DPI: 400 is treated as the neutral reference point.
  const dpiDelta = clamp(((400 - data.dpi) / 100) * 3, -6, 6);
  applyDelta(config, ['general', 'redDot'], dpiDelta);
  config.scope2x += Math.round(dpiDelta * 0.6);
  if (dpiDelta > 1) reasons.push('O DPI mais baixo exigiu um aumento moderado na resposta da mira.');
  if (dpiDelta < -1) reasons.push('O DPI mais alto permitiu reduzir a sensibilidade para evitar que a mira ultrapasse o alvo.');

  if (data.screenProtector === 'glass') {
    applyDelta(config, ['general', 'redDot'], 3);
    config.scope2x += 2;
    reasons.push('A película de vidro recebeu uma pequena compensação de sensibilidade.');
  } else if (data.screenProtector === 'hydrogel') {
    applyDelta(config, ['general', 'redDot'], 1);
    reasons.push('A película de hidrogel recebeu apenas uma compensação leve.');
  }

  if (data.screenState === 'worn') {
    applyDelta(config, ['general', 'redDot'], 2);
    reasons.push('A tela desgastada recebeu uma compensação pequena de resposta.');
  } else if (data.screenState === 'new') {
    applyDelta(config, ['general', 'redDot'], -1);
  }

  const styleAdjustments = {
    balanced: () => reasons.push('O perfil equilibrado manteve uma relação estável entre combate próximo e longa distância.'),
    rush: () => {
      config.general += 5;
      config.redDot += 6;
      config.scope2x += 2;
      config.fireButton += 1;
      reasons.push('O estilo rush aumentou moderadamente Geral e Ponto vermelho para movimentos rápidos em curta distância.');
    },
    long: () => {
      config.general -= 3;
      config.redDot -= 3;
      config.scope2x -= 2;
      config.scope4x -= 4;
      reasons.push('O estilo de longa distância reduziu as miras ampliadas para melhorar estabilidade e rastreamento.');
    },
    headshot: () => {
      config.general += 7;
      config.redDot += 8;
      config.scope2x += 4;
      config.scope4x -= 2;
      reasons.push('O perfil de capa elevou Geral e Ponto vermelho sem exagerar nas miras de maior zoom.');
    },
    sniper: () => {
      config.general -= 4;
      config.redDot -= 4;
      config.scope2x -= 3;
      config.scope4x -= 5;
      config.awm -= 10;
      reasons.push('O perfil sniper priorizou precisão, reduzindo principalmente a Mira AWM e a Mira 4x.');
    }
  };
  styleAdjustments[data.playStyle]();

  const fingerAdjustment = Math.max(0, data.fingers - 2);
  config.general -= fingerAdjustment;
  config.redDot -= fingerAdjustment;
  config.fireButton -= fingerAdjustment * 2;
  if (fingerAdjustment > 0) reasons.push(`O uso de ${data.fingers} dedos permitiu reduzir levemente a velocidade e o tamanho do botão de disparo.`);

  const preferenceAdjustments = {
    low: -12,
    medium: 0,
    high: 8,
    'very-high': 14
  };
  const preferenceDelta = preferenceAdjustments[data.preference];
  applyDelta(config, ['general', 'redDot'], preferenceDelta);
  config.scope2x += Math.round(preferenceDelta * 0.75);
  config.scope4x += Math.round(preferenceDelta * 0.45);
  config.freeLook += Math.round(preferenceDelta * 0.5);
  if (preferenceDelta !== 0) reasons.push(`A preferência por sensibilidade ${getPreferenceLabel(data.preference).toLowerCase()} ajustou a velocidade geral do perfil.`);

  const problemAdjustments = {
    none: () => {},
    'not-rising': () => {
      config.general += 7;
      config.redDot += 8;
      reasons.push('Como a mira não sobe, Geral e Ponto vermelho foram aumentados.');
    },
    overshoot: () => {
      config.general -= 8;
      config.redDot -= 10;
      config.scope2x -= 3;
      reasons.push('Como a mira passa da cabeça, Geral e Ponto vermelho foram reduzidos com maior intensidade.');
    },
    shaking: () => {
      config.redDot -= 8;
      config.scope2x -= 10;
      config.scope4x -= 10;
      reasons.push('O relato de tremor reduziu Ponto vermelho, Mira 2x e Mira 4x.');
    },
    'close-range': () => {
      config.general += 4;
      config.redDot += 5;
      reasons.push('A dificuldade em curta distância recebeu um aumento controlado nas miras mais usadas nesse alcance.');
    },
    'long-range': () => {
      config.scope2x -= 3;
      config.scope4x -= 5;
      reasons.push('A dificuldade em longa distância reduziu as miras ampliadas para favorecer estabilidade.');
    },
    sniper: () => {
      config.awm -= 8;
      reasons.push('A dificuldade com sniper reduziu a Mira AWM para priorizar precisão.');
    }
  };
  problemAdjustments[data.currentProblem]();

  if (data.ram <= 4) {
    const maxima = { general: 172, redDot: 185, scope2x: 190, scope4x: 175, awm: 150, freeLook: 135 };
    Object.entries(maxima).forEach(([key, maximum]) => {
      config[key] = Math.min(config[key], maximum);
    });
    reasons.push(`Com ${data.ram} GB de RAM, o cálculo limitou valores extremos para manter uma resposta equilibrada.`);
  }

  Object.keys(config).forEach(key => {
    const metadata = sensitivityMetadata[key];
    config[key] = clamp(config[key], 0, metadata.max);
  });

  return { config, reasons };
}

function generateReport(data, classification, config) {
  return {
    aparelho: `${data.brand} ${data.model}`,
    sistema: data.detected.os,
    navegador: data.detected.browser,
    classificacao: classification.label,
    pontuacao: `${classification.score}/14`,
    ram: `${data.ram} GB`,
    nucleos: data.detected.cores || 'Não disponível',
    tela: `${data.detected.screenWidth} × ${data.detected.screenHeight}px`,
    densidade: `${formatNumber(data.detected.devicePixelRatio || 1, 2)}× / DPI informado: ${data.dpi}`,
    atualizacao: `${data.refreshRate} Hz`,
    toque: data.detected.touch ? 'Disponível' : 'Não detectado',
    benchmark: `${data.benchmark.score}/100 (${data.benchmark.label})`,
    armazenamento: data.storageTotal > 0
      ? `${formatNumber(data.storageUsed)} GB usados de ${formatNumber(data.storageTotal)} GB (${formatNumber(100 - data.storageFreePercent)}% ocupado)`
      : 'Não informado',
    estilo: getPlayStyleLabel(data.playStyle),
    dedos: `${data.fingers} dedos`,
    preferencia: getPreferenceLabel(data.preference),
    problema: getProblemLabel(data.currentProblem),
    resultado: formatConfigCompact(config)
  };
}

function renderResults() {
  elements.performanceClassBadge.textContent = appState.classification.label;
  elements.resultSubtitle.textContent = `${appState.deviceData.brand} ${appState.deviceData.model} • ${appState.deviceData.refreshRate} Hz • DPI ${appState.deviceData.dpi}`;
  renderSensitivityCards();
  renderExplanation();
  renderTechnicalReport();
  saveLastSession();
}

function renderSensitivityCards() {
  elements.sensitivityCards.innerHTML = Object.entries(sensitivityMetadata).map(([key, metadata]) => {
    const value = appState.current[key];
    const width = (value / metadata.max) * 100;
    return `
      <article class="sensitivity-card" data-key="${key}">
        <div class="sensitivity-top">
          <span class="sensitivity-name">${escapeHtml(metadata.label)}</span>
          <strong class="sensitivity-value">${value}${metadata.unit}</strong>
        </div>
        <div class="meter"><span style="width: ${width}%"></span></div>
        <div class="sensitivity-bottom">
          <p>${escapeHtml(metadata.description)}</p>
          <div class="stepper" aria-label="Ajustar ${escapeHtml(metadata.label)}">
            <button type="button" data-action="decrease" aria-label="Diminuir ${escapeHtml(metadata.label)}">−</button>
            <button type="button" data-action="increase" aria-label="Aumentar ${escapeHtml(metadata.label)}">+</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderExplanation() {
  const data = appState.deviceData;
  const intro = `Seu aparelho possui ${data.ram} GB de RAM e foi classificado como <strong>${escapeHtml(appState.classification.label.toLowerCase())}</strong>. A configuração foi calculada com base em hardware, tela, estilo de jogo e no comportamento de mira informado.`;

  elements.recommendationExplanation.innerHTML = `
    <p>${intro}</p>
    <ul class="explanation-points">
      ${appState.explanation.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}
    </ul>
  `;
}

function renderTechnicalReport() {
  elements.technicalReport.innerHTML = Object.entries(appState.report).map(([key, value]) => `
    <div>
      <span>${escapeHtml(toTitleCase(key))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join('');
}

function adjustSensitivity(key, delta) {
  const metadata = sensitivityMetadata[key];
  if (!metadata || !appState.current) return;
  appState.current[key] = clamp(appState.current[key] + delta, 0, metadata.max);
  renderSensitivityCards();
  appState.report.resultado = formatConfigCompact(appState.current);
  renderTechnicalReport();
  saveLastSession();
}

function buildConfigText(config = appState.current) {
  return [
    'SensiSmart FF — Configuração recomendada',
    `Aparelho: ${appState.deviceData?.brand || ''} ${appState.deviceData?.model || ''}`.trim(),
    `Perfil: ${appState.classification?.label || 'Personalizado'}`,
    '',
    ...Object.entries(sensitivityMetadata).map(([key, metadata]) => `${metadata.label}: ${config[key]}${metadata.unit}`),
    '',
    'Insira os valores manualmente no jogo. Nenhum arquivo foi modificado.'
  ].join('\n');
}

async function copyText(text, successMessage = 'Configuração copiada.') {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(successMessage);
  } catch (error) {
    showToast('Não foi possível copiar automaticamente.');
  }
}

async function shareResult() {
  const text = buildConfigText();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'SensiSmart FF', text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  await copyText(text, 'Compartilhamento indisponível. Resultado copiado.');
}

function restoreRecommended() {
  appState.current = deepClone(appState.recommended);
  renderSensitivityCards();
  appState.report.resultado = formatConfigCompact(appState.current);
  renderTechnicalReport();
  saveLastSession();
  showToast('Valores recomendados restaurados.');
}

function calibrateSensitivity(formData) {
  const corrected = deepClone(appState.current);
  const data = appState.deviceData;
  const precisionBase = data.preference === 'very-high' ? 5 : data.preference === 'high' ? 4 : 3;

  if (formData.get('belowHead') === 'yes' && formData.get('aboveHead') !== 'yes') {
    corrected.general += clamp(precisionBase + 2, 3, 8);
    corrected.redDot += clamp(precisionBase + 3, 3, 8);
  }

  if (formData.get('aboveHead') === 'yes') {
    corrected.general -= clamp(precisionBase + 3, 3, 10);
    corrected.redDot -= clamp(precisionBase + 5, 3, 10);
  }

  if (formData.get('shaking') === 'yes') {
    corrected.redDot -= 5;
    corrected.scope2x -= clamp(6 + Math.max(0, data.refreshRate / 60 - 1), 4, 12);
    corrected.scope4x -= clamp(8 + Math.max(0, data.refreshRate / 60 - 1), 4, 12);
  }

  if ($('#sniperTooFast').checked) corrected.awm -= 10;
  if ($('#movementSlow').checked) {
    corrected.general += 5;
    corrected.freeLook += 6;
  }

  Object.keys(corrected).forEach(key => {
    corrected[key] = clamp(corrected[key], 0, sensitivityMetadata[key].max);
  });

  return corrected;
}

function renderComparison() {
  const header = `
    <div class="comparison-row header">
      <span>Configuração</span>
      <span>Anterior</span>
      <span>Corrigida</span>
      <span>Alteração</span>
    </div>`;

  const rows = Object.entries(sensitivityMetadata).map(([key, metadata]) => {
    const before = appState.current[key];
    const after = appState.calibrated[key];
    const change = after - before;
    const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : 'change-neutral';
    const changeText = change > 0 ? `+${change}` : String(change);
    return `
      <div class="comparison-row">
        <strong>${escapeHtml(metadata.label)}</strong>
        <span>${before}${metadata.unit}</span>
        <strong>${after}${metadata.unit}</strong>
        <span class="${changeClass}">${changeText}${metadata.unit}</span>
      </div>
    `;
  }).join('');

  elements.comparisonTable.innerHTML = header + rows;
}

function applyCalibration() {
  appState.current = deepClone(appState.calibrated);
  appState.report.resultado = formatConfigCompact(appState.current);
  appState.explanation.push('A configuração atual inclui uma correção baseada no teste prático de calibração da mira.');
  renderResults();
  showSection(elements.resultSection);
  showToast('Configuração corrigida aplicada.');
}

function saveProfile() {
  if (!appState.current || !appState.deviceData) return;

  const defaultName = getDefaultProfileName(appState.deviceData.playStyle);
  const requestedName = window.prompt('Nome do perfil:', defaultName);
  if (requestedName === null) return;
  const name = requestedName.trim().slice(0, 50) || defaultName;

  const profiles = getProfiles();
  profiles.unshift({
    id: self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    createdAt: new Date().toISOString(),
    deviceData: deepClone(appState.deviceData),
    classification: deepClone(appState.classification),
    recommended: deepClone(appState.recommended),
    configuration: deepClone(appState.current),
    explanation: deepClone(appState.explanation),
    report: deepClone(appState.report)
  });

  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(profiles.slice(0, 30)));
  showToast('Perfil salvo neste navegador.');
}

function getProfiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.profiles) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function renderProfiles() {
  const profiles = getProfiles();
  if (!profiles.length) {
    elements.profilesList.innerHTML = '<div class="empty-state">Nenhum perfil salvo ainda.</div>';
    return;
  }

  elements.profilesList.innerHTML = profiles.map(profile => {
    const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(profile.createdAt));
    return `
      <article class="profile-card" data-id="${escapeHtml(profile.id)}">
        <div>
          <h3>${escapeHtml(profile.name)}</h3>
          <div class="profile-meta">${escapeHtml(profile.deviceData.brand)} ${escapeHtml(profile.deviceData.model)} • ${escapeHtml(date)}</div>
          <p class="profile-summary">${escapeHtml(formatConfigCompact(profile.configuration))}</p>
        </div>
        <div class="profile-actions">
          <button class="button secondary small" type="button" data-profile-action="load">Abrir</button>
          <button class="button ghost small" type="button" data-profile-action="copy">Copiar</button>
          <button class="button danger small" type="button" data-profile-action="delete">Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function loadProfile(profile) {
  appState.deviceData = deepClone(profile.deviceData);
  appState.detected = deepClone(profile.deviceData.detected || {});
  appState.benchmark = deepClone(profile.deviceData.benchmark || {});
  appState.classification = deepClone(profile.classification);
  appState.recommended = deepClone(profile.recommended || profile.configuration);
  appState.current = deepClone(profile.configuration);
  appState.explanation = deepClone(profile.explanation || []);
  appState.report = deepClone(profile.report || generateReport(appState.deviceData, appState.classification, appState.current));
  renderResults();
  showSection(elements.resultSection);
  showToast(`Perfil “${profile.name}” carregado.`);
}

function deleteProfile(profileId) {
  const profiles = getProfiles();
  const profile = profiles.find(item => item.id === profileId);
  if (!profile) return;
  if (!window.confirm(`Excluir o perfil “${profile.name}”?`)) return;
  const updated = profiles.filter(item => item.id !== profileId);
  localStorage.setItem(STORAGE_KEYS.profiles, JSON.stringify(updated));
  renderProfiles();
  showToast('Perfil excluído.');
}

function saveLastSession() {
  if (!appState.current || !appState.deviceData) return;
  try {
    localStorage.setItem(STORAGE_KEYS.lastSession, JSON.stringify({
      deviceData: appState.deviceData,
      classification: appState.classification,
      recommended: appState.recommended,
      current: appState.current,
      explanation: appState.explanation,
      report: appState.report
    }));
  } catch (error) {
    // Storage may be unavailable in private browsing. The app continues without persistence.
  }
}

function clearAllData() {
  if (!window.confirm('Apagar todos os perfis e a última sessão salvos neste navegador?')) return;
  localStorage.removeItem(STORAGE_KEYS.profiles);
  localStorage.removeItem(STORAGE_KEYS.lastSession);
  appState.deviceData = null;
  appState.recommended = null;
  appState.current = null;
  renderProfiles();
  showToast('Dados locais apagados.');
}

function getPlayStyleLabel(value) {
  return ({ balanced: 'Equilibrado', rush: 'Rushador', long: 'Longa distância', headshot: 'Jogador de capa', sniper: 'Jogador de sniper' })[value] || value;
}

function getPreferenceLabel(value) {
  return ({ low: 'Baixa e controlada', medium: 'Média', high: 'Alta', 'very-high': 'Muito alta' })[value] || value;
}

function getProblemLabel(value) {
  return ({
    none: 'Nenhum / ainda não sabe',
    'not-rising': 'Mira não sobe',
    overshoot: 'Mira passa da cabeça',
    shaking: 'Mira treme',
    'close-range': 'Dificuldade em curta distância',
    'long-range': 'Dificuldade em longa distância',
    sniper: 'Dificuldade com sniper'
  })[value] || value;
}

function getDefaultProfileName(playStyle) {
  return ({
    balanced: 'Perfil equilibrado',
    rush: 'Perfil rush',
    long: 'Perfil longa distância',
    headshot: 'Perfil capa',
    sniper: 'Perfil sniper'
  })[playStyle] || 'Perfil personalizado';
}

function formatConfigCompact(config) {
  return `Geral ${config.general} • Red Dot ${config.redDot} • 2x ${config.scope2x} • 4x ${config.scope4x} • AWM ${config.awm} • Livre ${config.freeLook} • Botão ${config.fireButton}%`;
}

function toTitleCase(value) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase());
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  })[character]);
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  elements.connectionStatus.textContent = online ? 'Online' : 'Offline';
  elements.connectionStatus.classList.toggle('offline', !online);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {
        // The app remains usable even when service workers are unavailable.
      });
    });
  }
}

function bindEvents() {
  elements.startAnalysisButton.addEventListener('click', async () => {
    showSection(elements.analysisSection);
    await analyzeDevice();
  });

  $('#rerunDetectionButton').addEventListener('click', analyzeDevice);
  $('#fillReferenceButton').addEventListener('click', fillReferenceDevice);

  elements.deviceForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!validateDeviceForm()) return;

    appState.deviceData = collectDeviceData();
    appState.classification = classifyDevice(appState.deviceData);
    const calculation = calculateSensitivity(appState.deviceData, appState.classification);
    appState.recommended = deepClone(calculation.config);
    appState.current = deepClone(calculation.config);
    appState.explanation = calculation.reasons;
    appState.report = generateReport(appState.deviceData, appState.classification, appState.current);
    renderResults();
    showSection(elements.resultSection);
  });

  elements.sensitivityCards.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-key]');
    const key = card?.dataset.key;
    adjustSensitivity(key, button.dataset.action === 'increase' ? 1 : -1);
  });

  $('#copyButton').addEventListener('click', () => copyText(buildConfigText()));
  $('#shareButton').addEventListener('click', shareResult);
  $('#restoreButton').addEventListener('click', restoreRecommended);
  $('#saveProfileButton').addEventListener('click', saveProfile);
  $('#restartButton').addEventListener('click', () => showSection(elements.analysisSection));
  $('#calibrateButton').addEventListener('click', () => showSection(elements.calibrationSection));
  $('#cancelCalibrationButton').addEventListener('click', () => showSection(elements.resultSection));

  elements.calibrationForm.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(elements.calibrationForm);
    if (!formData.get('belowHead') || !formData.get('aboveHead') || !formData.get('shaking')) {
      showToast('Responda às três perguntas de calibração.');
      return;
    }
    appState.calibrated = calibrateSensitivity(formData);
    renderComparison();
    showSection(elements.comparisonSection);
  });

  $('#applyCalibrationButton').addEventListener('click', applyCalibration);
  $('#copyCalibratedButton').addEventListener('click', () => copyText(buildConfigText(appState.calibrated), 'Configuração corrigida copiada.'));
  $('#backToResultButton').addEventListener('click', () => showSection(elements.resultSection));

  elements.openProfilesButton.addEventListener('click', () => {
    renderProfiles();
    showSection(elements.profilesSection);
  });
  elements.closeProfilesButton.addEventListener('click', () => {
    $('#inicio').scrollIntoView({ behavior: 'smooth' });
    elements.profilesSection.classList.add('hidden');
  });

  elements.profilesList.addEventListener('click', event => {
    const button = event.target.closest('button[data-profile-action]');
    const card = event.target.closest('[data-id]');
    if (!button || !card) return;
    const profiles = getProfiles();
    const profile = profiles.find(item => item.id === card.dataset.id);
    if (!profile) return;

    if (button.dataset.profileAction === 'load') loadProfile(profile);
    if (button.dataset.profileAction === 'copy') {
      const previousDevice = appState.deviceData;
      const previousClass = appState.classification;
      appState.deviceData = profile.deviceData;
      appState.classification = profile.classification;
      copyText(buildConfigText(profile.configuration), 'Perfil copiado.').finally(() => {
        appState.deviceData = previousDevice;
        appState.classification = previousClass;
      });
    }
    if (button.dataset.profileAction === 'delete') deleteProfile(profile.id);
  });

  $('#clearDataButton').addEventListener('click', clearAllData);

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  window.addEventListener('orientationchange', () => {
    appState.detected.orientation = getOrientationLabel();
    if (!elements.analysisSection.classList.contains('hidden')) renderDetectedData();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    appState.installPrompt = event;
    elements.installButton.classList.remove('hidden');
  });

  elements.installButton.addEventListener('click', async () => {
    if (!appState.installPrompt) {
      showToast('Use o menu do navegador e escolha “Instalar aplicativo”.');
      return;
    }
    appState.installPrompt.prompt();
    await appState.installPrompt.userChoice;
    appState.installPrompt = null;
    elements.installButton.classList.add('hidden');
  });
}

function initialize() {
  bindEvents();
  updateConnectionStatus();
  registerServiceWorker();
}

initialize();
