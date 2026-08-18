/* ==========================================================================
   Our World — Atlas Trivia

   Questions are generated at run time from window.ATLAS (see
   tools/build_quiz_data.py) rather than stored as a fixed question bank, so
   every round is different and the whole atlas stays in play.

   Each builder returns a question object, or null when the current country
   or pool can't support that shape (no landlocked nations in Oceania, an
   official name that gives the answer away). The picker treats null as
   "try another type", so a thin region degrades gracefully.
   ========================================================================== */

(function () {
  'use strict';

  var ATLAS = window.ATLAS || [];
  var CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

  /* ---------------------------------------------------------------- utils */

  function shuffle(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function num(n) { return typeof n === 'number' ? n.toLocaleString('en-AU') : '—'; }

  /* Wrong answers are drawn from the same continent first: "Nairobi, Kampala,
     Kigali, Dodoma" is a real question, whereas throwing Oslo into an East
     African line-up hands over the answer. */
  function distractors(pool, country, valueOf, correct, want, alsoCorrect) {
    var seen = {};
    seen[String(correct).toLowerCase()] = true;
    // Canada is officially English AND French; offering the other as a wrong
    // answer would mark a correct choice incorrect.
    (alsoCorrect || []).forEach(function (v) { if (v) seen[String(v).toLowerCase()] = true; });

    function harvest(candidates) {
      var found = [];
      shuffle(candidates).forEach(function (c) {
        if (found.length >= want) return;
        var values = valueOf(c);
        if (!Array.isArray(values)) values = [values];
        for (var i = 0; i < values.length; i++) {
          var v = values[i];
          if (!v) continue;
          var key = String(v).toLowerCase();
          if (seen[key]) continue;
          seen[key] = true;
          found.push(v);
          break;
        }
      });
      return found;
    }

    var near = pool.filter(function (c) {
      return c.continent === country.continent && c.a3 !== country.a3;
    });
    var out = harvest(near);
    if (out.length < want) {
      out = out.concat(harvest(pool.filter(function (c) { return c.a3 !== country.a3; })));
    }
    return out.slice(0, want);
  }

  /* Blurbs and fun facts name the country and its capital outright, so both
     are masked before the text can be used as a question. */
  function redact(text, terms) {
    if (!text) return text;
    var masked = text;
    terms.filter(Boolean).forEach(function (term) {
      var safe = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(safe, 'gi'), '———');
    });
    return masked;
  }

  function assemble(correct, wrongs, extra) {
    if (wrongs.length < 3) return null;
    var options = shuffle([correct].concat(wrongs.slice(0, 3)));
    var q = {
      options: options,
      answer: options.indexOf(correct),
      correct: correct
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) q[k] = extra[k];
    return q;
  }

  /* Djibouti, Singapore, Luxembourg, Monaco and Vatican City name their own
     capital, so asking either direction hands over the answer. Near-misses
     like Mexico → Mexico City or Tunisia → Tunis are kept: they still take
     knowing which form is the city. */
  function selfNaming(c) {
    return String(c.name).trim().toLowerCase() === String(c.capital).trim().toLowerCase();
  }

  /* ------------------------------------------------------- question types */

  var BUILDERS = {

    capital: function (c, pool) {
      if (selfNaming(c)) return null;
      return assemble(c.capital, distractors(pool, c, function (x) { return x.capital; }, c.capital, 3), {
        tag: 'Capitals',
        kicker: 'Capital city',
        prompt: 'What is the capital of ' + c.name + '?',
        note: c.note || c.sig,
        subject: c.name
      });
    },

    country: function (c, pool) {
      if (selfNaming(c)) return null;
      return assemble(c.name, distractors(pool, c, function (x) { return x.name; }, c.name, 3), {
        tag: 'Capitals',
        kicker: 'Country',
        prompt: c.capital + ' is the capital of which country?',
        note: c.sig,
        subject: c.capital
      });
    },

    landmark: function (c, pool) {
      if (!c.places || !c.places.length) return null;

      // "Casbah of Algiers" gives the answer away; "Botswana National Museum"
      // does not — naming the country still leaves the capital to be known.
      // So only the capital disqualifies a landmark, and only the capital is
      // masked out of the description.
      var usable = c.places.filter(function (p) {
        return !new RegExp(String(c.capital).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(p[0]);
      });
      if (!usable.length) return null;

      var place = pick(usable);
      return assemble(c.capital, distractors(pool, c, function (x) { return x.capital; }, c.capital, 3), {
        tag: 'Landmarks',
        kicker: 'Landmark',
        prompt: 'In which capital city would you find ' + place[0] + '?',
        quote: redact(place[1], [c.capital]),
        note: place[0] + ' is in ' + c.capital + ', the capital of ' + c.name + '.',
        subject: place[0]
      });
    },

    blurb: function (c, pool) {
      if (!c.sig) return null;
      var masked = redact(c.sig, [c.capital, c.name, c.official]);
      if (masked.indexOf('———') === -1) return null;  // nothing hidden — too easy
      return assemble(c.capital, distractors(pool, c, function (x) { return x.capital; }, c.capital, 3), {
        tag: 'Capitals',
        kicker: 'Which city?',
        prompt: pick(['Which capital city is described here?',
                      'Which capital is this?',
                      'Name the capital city from this description.']),
        quote: masked,
        note: c.sig,
        subject: 'a capital city'
      });
    },

    continent: function (c, pool) {
      // South Africa and the Central African Republic answer this one in
      // their own names.
      if (String(c.name).toLowerCase().indexOf(String(c.continent).toLowerCase()) !== -1) return null;
      var others = shuffle(CONTINENTS.filter(function (x) { return x !== c.continent; }));
      return assemble(c.continent, others, {
        tag: 'Geography',
        kicker: 'Continent',
        prompt: 'Which continent is ' + c.name + ' in?',
        note: c.name + ' sits in ' + c.subregion + '.',
        subject: c.name
      });
    },

    currency: function (c, pool) {
      if (!c.currencies || !c.currencies.length) return null;
      var money = c.currencies[0];
      return assemble(money, distractors(pool, c, function (x) { return x.currencies; }, money, 3, c.currencies), {
        tag: 'Currencies',
        kicker: 'Currency',
        prompt: 'Which currency is used in ' + c.name + '?',
        note: 'The currency of ' + c.name + ' is the ' + money + '.',
        subject: c.name
      });
    },

    language: function (c, pool) {
      if (!c.languages || !c.languages.length) return null;
      // "Japan → Japanese" is not a question. Prefer a language whose name
      // isn't built from the country's; Rwanda still works via French.
      var fair = c.languages.filter(function (l) {
        var a = String(l).toLowerCase(), b = String(c.name).toLowerCase();
        return a.indexOf(b) === -1 && b.indexOf(a) === -1;
      });
      if (!fair.length) return null;
      var tongue = pick(fair);
      return assemble(tongue, distractors(pool, c, function (x) { return x.languages; }, tongue, 3, c.languages), {
        tag: 'Languages',
        kicker: 'Language',
        prompt: 'Which language is official in ' + c.name + '?',
        note: c.languages.length > 1
          ? c.name + ' recognises ' + c.languages.join(', ') + '.'
          : c.name + ' has ' + tongue + ' as its official language.',
        subject: c.name
      });
    },

    population: function (c, pool) {
      var field = pool.filter(function (x) { return typeof x.population === 'number'; });
      if (field.length < 4) return null;
      var four = shuffle(field).slice(0, 4);
      var top = four.slice().sort(function (a, b) { return b.population - a.population; })[0];
      var options = shuffle(four.map(function (x) { return x.name; }));
      return {
        tag: 'Population',
        kicker: 'Biggest population',
        prompt: 'Which of these countries has the largest population?',
        options: options,
        answer: options.indexOf(top.name),
        correct: top.name,
        note: top.name + ' has about ' + num(top.population) + ' people (' + top.pop_year + ').',
        subject: 'population'
      };
    },

    area: function (c, pool) {
      var field = pool.filter(function (x) { return typeof x.area === 'number'; });
      if (field.length < 4) return null;
      var four = shuffle(field).slice(0, 4);
      var top = four.slice().sort(function (a, b) { return b.area - a.area; })[0];
      var options = shuffle(four.map(function (x) { return x.name; }));
      return {
        tag: 'Area',
        kicker: 'Largest by area',
        prompt: 'Which of these countries covers the most land?',
        options: options,
        answer: options.indexOf(top.name),
        correct: top.name,
        note: top.name + ' spans about ' + num(top.area) + ' km².',
        subject: 'area'
      };
    },

    landlocked: function (c, pool) {
      var locked = pool.filter(function (x) { return x.landlocked; });
      var coastal = pool.filter(function (x) { return !x.landlocked; });
      if (!locked.length || coastal.length < 3) return null;
      var target = pick(locked);
      var options = shuffle([target.name].concat(shuffle(coastal).slice(0, 3).map(function (x) { return x.name; })));
      return {
        tag: 'Geography',
        kicker: 'Landlocked',
        prompt: 'Which of these countries is landlocked?',
        options: options,
        answer: options.indexOf(target.name),
        correct: target.name,
        note: target.name + ' has no coastline — it sits entirely inland in ' + target.subregion + '.',
        subject: 'landlocked'
      };
    },

    fun: function (c, pool) {
      if (!c.fun) return null;
      var masked = redact(c.fun, [c.name, c.capital, c.official]);
      if (masked.indexOf('———') === -1) return null;
      return assemble(c.name, distractors(pool, c, function (x) { return x.name; }, c.name, 3), {
        tag: 'Curiosities',
        kicker: 'True of which country?',
        prompt: pick(['Which country is this true of?',
                      'This describes which country?',
                      'Which country does this belong to?']),
        quote: masked,
        note: c.fun,
        subject: 'a fun fact'
      });
    },

    official: function (c, pool) {
      // Only worth asking when the formal name hides the common one —
      // "Hellenic Republic" is a question, "Republic of Angola" is not.
      if (!c.official || c.official.toLowerCase().indexOf(c.name.toLowerCase()) !== -1) return null;
      return assemble(c.name, distractors(pool, c, function (x) { return x.name; }, c.name, 3), {
        tag: 'Formal names',
        kicker: 'Official name',
        prompt: 'Which country is formally called the ' + c.official + '?',
        note: c.name + ' is officially the ' + c.official + '.',
        subject: c.official
      });
    }
  };

  /* Relative frequency per topic. Capitals dominate everywhere, because
     that is what the atlas is richest in and what was asked for. */
  var TOPICS = {
    capitals: {
      label: 'Capitals only',
      weights: { capital: 5, country: 3, landmark: 2, blurb: 1.5 }
    },
    mixed: {
      label: 'Mostly capitals',
      weights: { capital: 5, country: 3, landmark: 2, blurb: 1, continent: 1.5, currency: 1.2, language: 1.2 }
    },
    everything: {
      label: 'The full atlas',
      weights: {
        capital: 3.5, country: 2.5, landmark: 2, blurb: 1, continent: 1.2, currency: 1.2,
        language: 1.2, population: 1.3, area: 1.3, landlocked: 1, fun: 1.4, official: 1
      }
    }
  };

  function weightedTypes(weights) {
    var bag = [];
    for (var type in weights) {
      if (!Object.prototype.hasOwnProperty.call(weights, type)) continue;
      var n = Math.round(weights[type] * 10);
      for (var i = 0; i < n; i++) bag.push(type);
    }
    return bag;
  }

  /* -------------------------------------------------------- quiz assembly */

  function buildQuiz(count, topicKey, region) {
    var pool = region === 'all'
      ? ATLAS.slice()
      : ATLAS.filter(function (c) { return c.continent === region; });
    if (pool.length < 4) return [];

    var bag = weightedTypes(TOPICS[topicKey].weights);
    var questions = [];
    var usedKeys = {};      // type|country — never the same question twice
    var countryUse = {};    // keeps one country from dominating a short round
    var maxPerCountry = Math.max(1, Math.ceil(count / Math.min(pool.length, 12)));

    var guard = count * 60;
    while (questions.length < count && guard-- > 0) {
      var type = pick(bag);
      var candidates = shuffle(pool);

      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var key = type + '|' + c.a3;
        if (usedKeys[key]) continue;
        if ((countryUse[c.a3] || 0) >= maxPerCountry) continue;

        var q = BUILDERS[type](c, pool);
        if (!q) continue;

        // Comparison questions aren't tied to one country; key them by their
        // option set so the same four nations don't come up twice.
        // Comparison questions aren't tied to one country, so they are keyed
        // by their winner: two "largest population" questions both answering
        // Australia read as a repeat even with different line-ups.
        var dedupe = (type === 'population' || type === 'area' || type === 'landlocked')
          ? type + '|winner|' + q.correct
          : key;
        if (usedKeys[dedupe]) continue;

        usedKeys[dedupe] = true;
        usedKeys[key] = true;
        countryUse[c.a3] = (countryUse[c.a3] || 0) + 1;
        q.type = type;
        questions.push(q);
        break;
      }

      // A small region can exhaust unique questions before reaching the
      // requested count; loosen the per-country cap rather than loop forever.
      if (guard % 40 === 0) maxPerCountry++;
    }

    return questions;
  }

  /* ------------------------------------------------------------------ DOM */

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    setup: $('screen-setup'), quiz: $('screen-quiz'), results: $('screen-results'),
    countChips: $('count-chips'), topicOptions: $('topic-options'), regionChips: $('region-chips'),
    regionHint: $('region-hint'), startBtn: $('start-btn'), setupBest: $('setup-best'),
    qCurrent: $('q-current'), qTotal: $('q-total'), qTag: $('q-tag'), scoreNow: $('score-now'),
    progressFill: $('progress-fill'), progress: document.querySelector('.progress'),
    kicker: $('q-kicker'), questionText: $('question-text'), quote: $('q-quote'),
    options: $('options'), verdict: $('verdict'), verdictHead: $('verdict-head'),
    verdictNote: $('verdict-note'), nextBtn: $('next-btn'), nextLabel: $('next-label'),
    quizHint: $('quiz-hint'), quitBtn: $('quit-btn'), live: $('live-region'),
    ringValue: $('ring-value'), ringScore: $('ring-score'), ringPct: $('ring-pct'),
    resultsRank: $('results-rank'), resultsTitle: $('results-title'), resultsBlurb: $('results-blurb'),
    statTime: $('stat-time'), statTopic: $('stat-topic'), statRegion: $('stat-region'),
    statBest: $('stat-best'), statBestWrap: $('stat-best-wrap'),
    againBtn: $('again-btn'), changeBtn: $('change-btn'), reviewList: $('review-list'),
    themeToggle: $('theme-toggle')
  };

  var settings = { count: 10, topic: 'mixed', region: 'all' };
  var state = null;

  /* --------------------------------------------------------------- screen */

  function show(screen) {
    [el.setup, el.quiz, el.results].forEach(function (s) { s.hidden = s !== screen; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function announce(message) { el.live.textContent = message; }

  /* -------------------------------------------------------------- storage */

  function bestKey() {
    return 'ourworld.best.' + settings.topic + '.' + settings.region + '.' + settings.count;
  }

  function readBest() {
    try {
      var raw = localStorage.getItem(bestKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeBest(score, total) {
    try {
      var prev = readBest();
      if (prev && prev.score / prev.total >= score / total) return false;
      localStorage.setItem(bestKey(), JSON.stringify({ score: score, total: total }));
      return !!prev;   // true only when an existing best was beaten
    } catch (e) { return false; }
  }

  function refreshBestLine() {
    var best = readBest();
    if (!best) { el.setupBest.hidden = true; return; }
    el.setupBest.hidden = false;
    el.setupBest.innerHTML = 'Your best at this setting: <strong>' + best.score + '/' + best.total + '</strong>';
  }

  /* ---------------------------------------------------------------- setup */

  function wireRadioGroup(container, attribute, onChoose) {
    container.addEventListener('click', function (event) {
      var button = event.target.closest('[role="radio"]');
      if (!button || !container.contains(button)) return;
      container.querySelectorAll('[role="radio"]').forEach(function (b) {
        b.setAttribute('aria-checked', String(b === button));
      });
      onChoose(button.dataset[attribute]);
    });
  }

  function updateRegionHint() {
    var pool = settings.region === 'all'
      ? ATLAS
      : ATLAS.filter(function (c) { return c.continent === settings.region; });
    var where = settings.region === 'all' ? 'the whole atlas' : settings.region;
    el.regionHint.textContent = pool.length + ' countries in ' + where + '.';
  }

  wireRadioGroup(el.countChips, 'count', function (value) {
    settings.count = parseInt(value, 10);
    refreshBestLine();
  });

  wireRadioGroup(el.topicOptions, 'topic', function (value) {
    settings.topic = value;
    refreshBestLine();
  });

  wireRadioGroup(el.regionChips, 'region', function (value) {
    settings.region = value;
    updateRegionHint();
    refreshBestLine();
  });

  /* ----------------------------------------------------------------- quiz */

  function startQuiz() {
    var questions = buildQuiz(settings.count, settings.topic, settings.region);
    if (!questions.length) {
      el.regionHint.textContent = 'Not enough data for that combination — try another region.';
      return;
    }
    state = {
      questions: questions,
      index: 0,
      score: 0,
      answers: [],
      locked: false,
      startedAt: Date.now()
    };
    el.qTotal.textContent = questions.length;
    show(el.quiz);
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    state.locked = false;

    el.qCurrent.textContent = state.index + 1;
    el.qTag.textContent = q.tag;
    el.scoreNow.textContent = state.score;

    var pct = Math.round((state.index / state.questions.length) * 100);
    el.progressFill.style.width = pct + '%';
    el.progress.setAttribute('aria-valuenow', String(pct));

    el.kicker.textContent = q.kicker || '';
    el.kicker.hidden = !q.kicker;
    el.questionText.textContent = q.prompt;
    el.quote.textContent = q.quote || '';
    el.quote.hidden = !q.quote;

    el.verdict.hidden = true;
    el.verdict.classList.remove('is-right', 'is-wrong');
    el.nextBtn.hidden = true;
    el.quizHint.hidden = false;
    el.nextLabel.textContent = state.index === state.questions.length - 1 ? 'See results' : 'Next question';

    el.options.innerHTML = '';
    q.options.forEach(function (option, i) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'option';
      button.dataset.index = String(i);
      button.innerHTML =
        '<span class="option__key">' + (i + 1) + '</span>' +
        '<span class="option__text"></span>' +
        '<span class="option__mark" aria-hidden="true"></span>';
      button.querySelector('.option__text').textContent = option;
      button.addEventListener('click', function () { answer(i); });
      el.options.appendChild(button);
    });

    announce('Question ' + (state.index + 1) + ' of ' + state.questions.length + '. ' + q.prompt);
  }

  function answer(chosen) {
    if (state.locked) return;
    state.locked = true;

    var q = state.questions[state.index];
    var right = chosen === q.answer;
    if (right) state.score++;

    state.answers.push({ question: q, chosen: chosen, right: right });

    Array.prototype.forEach.call(el.options.children, function (button, i) {
      button.disabled = true;
      var mark = button.querySelector('.option__mark');
      if (i === q.answer) {
        button.classList.add('is-correct');
        mark.textContent = '✓';
      } else if (i === chosen) {
        button.classList.add('is-wrong');
        mark.textContent = '✕';
      } else {
        button.classList.add('is-muted');
      }
    });

    el.verdict.hidden = false;
    el.verdict.classList.add(right ? 'is-right' : 'is-wrong');
    el.verdictHead.textContent = right
      ? pick(['Correct.', 'Spot on.', 'That’s it.', 'Well played.'])
      : 'Not quite — it’s ' + q.correct + '.';
    el.verdictNote.textContent = q.note || '';
    el.verdictNote.hidden = !q.note;

    el.scoreNow.textContent = state.score;
    el.nextBtn.hidden = false;
    el.quizHint.hidden = true;
    el.nextBtn.focus();

    announce((right ? 'Correct. ' : 'Incorrect. The answer is ' + q.correct + '. ') + (q.note || ''));
  }

  function advance() {
    if (state.index >= state.questions.length - 1) { finish(); return; }
    state.index++;
    renderQuestion();
  }

  /* -------------------------------------------------------------- results */

  var RANKS = [
    { at: 100, rank: 'Perfect round', title: 'Every single one.', blurb: 'A flawless run through the atlas. There is nothing left to teach you here.' },
    { at: 85,  rank: 'Cartographer', title: 'Outstanding.', blurb: 'You know this atlas nearly cover to cover — only a couple slipped past.' },
    { at: 70,  rank: 'Navigator', title: 'Strong round.', blurb: 'A confident showing. The gaps that remain are the interesting ones.' },
    { at: 50,  rank: 'Explorer', title: 'Solid effort.', blurb: 'More right than wrong, with plenty of atlas still to discover.' },
    { at: 30,  rank: 'Wanderer', title: 'Getting there.', blurb: 'Some good instincts in the mix. Another round will move the needle.' },
    { at: 0,   rank: 'Setting out', title: 'Early days.', blurb: 'The world is a big place. Read the answers below and go again.' }
  ];

  function finish() {
    var total = state.answers.length;
    var score = state.score;
    var pct = total ? Math.round((score / total) * 100) : 0;
    var seconds = Math.round((Date.now() - state.startedAt) / 1000);

    el.progressFill.style.width = '100%';

    var rank = RANKS.find(function (r) { return pct >= r.at; });
    el.resultsRank.textContent = rank.rank;
    el.resultsTitle.textContent = rank.title;
    el.resultsBlurb.textContent = rank.blurb;

    el.ringScore.textContent = score + '/' + total;
    el.ringPct.textContent = pct + '%';

    var circumference = 2 * Math.PI * 52;
    el.ringValue.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.ringValue.style.strokeDashoffset = String(circumference * (1 - pct / 100));
      });
    });

    var mins = Math.floor(seconds / 60);
    el.statTime.textContent = mins ? mins + 'm ' + (seconds % 60) + 's' : seconds + 's';
    el.statTopic.textContent = TOPICS[settings.topic].label;
    el.statRegion.textContent = settings.region === 'all' ? 'Whole world' : settings.region;

    var beaten = writeBest(score, total);
    var best = readBest();
    el.statBest.textContent = best ? best.score + '/' + best.total : score + '/' + total;
    if (beaten) el.resultsBlurb.textContent = rank.blurb + ' That is a new personal best at this setting.';

    renderReview();
    show(el.results);
    announce('Quiz complete. You scored ' + score + ' out of ' + total + '.');
  }

  function renderReview() {
    el.reviewList.innerHTML = '';
    state.answers.forEach(function (record, i) {
      var q = record.question;
      var item = document.createElement('li');
      item.className = 'review__item ' + (record.right ? 'is-right' : 'is-wrong');

      var chosenText = q.options[record.chosen];
      var answerLine = record.right
        ? '<b class="yes">' + escapeHtml(q.correct) + '</b>'
        : '<b class="no">' + escapeHtml(chosenText) + '</b> → <b class="yes">' + escapeHtml(q.correct) + '</b>';

      item.innerHTML =
        '<span class="review__icon" aria-hidden="true">' + (record.right ? '✓' : '✕') + '</span>' +
        '<div class="review__body">' +
          '<p class="review__q">' + (i + 1) + '. ' + escapeHtml(q.prompt) + '</p>' +
          '<p class="review__a">' + answerLine + (q.note ? ' · ' + escapeHtml(q.note) : '') + '</p>' +
        '</div>';
      el.reviewList.appendChild(item);
    });
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------------------------------------------------- wiring */

  el.startBtn.addEventListener('click', startQuiz);
  el.nextBtn.addEventListener('click', advance);
  el.againBtn.addEventListener('click', startQuiz);

  el.changeBtn.addEventListener('click', function () {
    refreshBestLine();
    show(el.setup);
  });

  el.quitBtn.addEventListener('click', function () {
    if (!state.answers.length) { show(el.setup); return; }
    finish();
  });

  document.addEventListener('keydown', function (event) {
    if (el.quiz.hidden) return;
    if (event.key >= '1' && event.key <= '4' && !state.locked) {
      var index = parseInt(event.key, 10) - 1;
      if (index < el.options.children.length) {
        event.preventDefault();
        answer(index);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && state.locked && !el.nextBtn.hidden) {
      event.preventDefault();
      advance();
    }
  });

  /* ----------------------------------------------------------------- theme */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.themeToggle.setAttribute('aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem('ourworld.theme', theme); } catch (e) { /* private mode */ }
  }

  el.themeToggle.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('ourworld.theme'); } catch (e) { /* private mode */ }
    if (saved) { applyTheme(saved); return; }
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  })();

  /* Exposed for automated tests — lets a spec generate rounds and assert
     invariants without driving the UI a thousand times. */
  window.OurWorldQuiz = { buildQuiz: buildQuiz, TOPICS: TOPICS, BUILDERS: BUILDERS, ATLAS: ATLAS };

  /* ------------------------------------------------------------------ boot */

  if (!ATLAS.length) {
    el.regionHint.textContent = 'Atlas data failed to load — run tools/build_quiz_data.py.';
    el.startBtn.disabled = true;
  }

  updateRegionHint();
  refreshBestLine();
})();
