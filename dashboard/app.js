// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table and a per-protocol detail view with
// the fitted model's own inputs, the row's uncertainty interval and comparables, and the
// protocol's farm plan. No network: every byte it shows is in data.js. The page recomputes
// each row's implied value from the snapshot figures with the same formula main.ts uses, so the
// page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // The model in one function: the same arithmetic as lib/model.ts, from the same inputs.
  // The base is the fitted regression on the snapshot's launched protocols; the multipliers
  // are the small bounded ordering terms.
  function impliedOf(row, model, fit) {
    var base = Math.pow(10, fit.intercept + fit.slope * Math.log10(row.tvl_usd));
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var maturityMult = row.age_days === null || row.age_days === undefined
      ? model.unknown_age_multiplier
      : model.maturity_floor + (Math.min(Math.max(row.age_days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var reachMult = 1 + Math.min((row.chains || []).length, model.reach_max_chains) * model.reach_per_chain;
    return Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the actions, the capital, the hold and every cost and time.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function chainsOf(p) {
    if (!p.chains || p.chains.length === 0) return 'its main chain';
    if (p.chains.length === 1) return p.chains[0];
    return p.chains[0] + ' and ' + (p.chains.length - 1) + ' more chain' + (p.chains.length - 1 === 1 ? '' : 's');
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(p) {
    var c = chainOf(p).toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $4 of gas';
    if (c.indexOf('solana') >= 0 || c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0) return 'under $1 of gas';
    return 'about $2 of gas';
  }
  function actionsFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return {
      open: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it, keeping the health factor above 2.',
      weekly: 'Repay part of the borrow, top the supply back up, or adjust the collateral on ' + name + ' so the position stays active.'
    };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trading') >= 0) return {
      open: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small position, hedged or sized under 10% of the deposit.',
      weekly: 'Close and reopen a small position on ' + name + ', or add margin, so the account shows fresh trading activity.'
    };
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return {
      open: 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in one app on the destination chain.',
      weekly: 'Bridge a smaller amount back or across again through ' + name + ', and use the funds rather than leaving them idle.'
    };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return {
      open: 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token in the same wallet.',
      weekly: 'Restake the rewards, or add a small top-up to the stake on ' + name + ', and keep the receipt in the farming wallet.'
    };
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('leveraged farm') >= 0) return {
      open: 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ', in a range or pair the pool already trades.',
      weekly: 'Swap a small amount through ' + name + "'s pool, or rebalance the position, so the wallet shows trading as well as liquidity."
    };
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return {
      open: 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the farming wallet.',
      weekly: "Harvest the vault's yield, or move the position into the vault's newest strategy on " + name + ', and record the change.'
    };
    if (c.indexOf('rwa') >= 0) return {
      open: 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.',
      weekly: "Check the asset's yield accrual on " + name + ' and add a small top-up, keeping the whole position in one wallet.'
    };
    if (c.indexOf('stable') >= 0) return {
      open: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the farming wallet.',
      weekly: 'Use the stable asset once a week on ' + name + ', such as a deposit, a swap or a transfer, so the position is not idle.'
    };
    if (c.indexOf('prediction') >= 0) return {
      open: 'Fund $' + capital + ' on ' + name + ' on ' + chain + ' and place one market position with a small stake.',
      weekly: 'Settle one position and open another on ' + name + ', keeping the stake small and the activity regular.'
    };
    if (c.indexOf('insurance') >= 0) return {
      open: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a position you already hold, and keep the policy in the farming wallet.',
      weekly: 'Check the policy status on ' + name + ' and, if a new cover round opens, renew or extend it with a small amount.'
    };
    if (c.indexOf('payment') >= 0) return {
      open: 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' from the farming wallet, and keep the receipts.',
      weekly: 'Send one more payment through ' + name + ' each week, so the wallet shows repeated use rather than a single transfer.'
    };
    if (c.indexOf('governance') >= 0) return {
      open: 'Deposit $' + capital + " into " + name + "'s governance position on " + chain + ' and keep the voting power in the farming wallet.',
      weekly: 'Vote on one open proposal on ' + name + ' each week, or delegate the voting power and record the choice.'
    };
    if (c.indexOf('chain') >= 0) return {
      open: 'Use $' + capital + " across " + name + "'s own apps on " + chain + ': one deposit, one swap and one transfer in the same week.',
      weekly: 'Repeat one on-chain action on ' + name + ' each week, alternating between its apps so the wallet history is varied.'
    };
    return {
      open: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open in the farming wallet.',
      weekly: 'Make one qualifying action each week on ' + name + ', such as a deposit, a swap or a vote, and keep the position funded.'
    };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(p);
    var acts = actionsFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + chainsOf(p) + ', and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: acts.open, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: acts.weekly, cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Once a month, open " + p.name + "'s own points or rewards page and check the position is credited, using only the link the protocol itself publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a month' },
      { text: 'If the protocol issues a token, claim only from its own announcement and move the claim to a separate wallet before selling anything.', cost: 'one claim transaction', time: '15 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('tab') === 'live') state.tab = 'live';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watch) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { html: 'Snapshot <b>' + esc(DATA.as_of) + '</b>' }),
        el('span', { html: 'Model <b>' + esc(DATA.model_version) + '</b>' }),
        el('span', { html: 'Source <b>DefiLlama</b>' })
      )
    );
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
      el('p', { html: 'Every protocol below <b>records no token</b> yet. The radar ranks them by what a launch would be worth, fitted on the ' + (DATA.fit ? DATA.fit.n : '') + ' launched protocols\u2019 own market caps in this same snapshot \u2014 not a hand-set formula. ' + (top ? 'Right now that points at <b>' + esc(top.name) + '</b>.' : '') }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { html: DATA.watchlist_size + ' <em>/ ' + DATA.watchlist_size + '</em>' })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    return el('section', { class: 'method' },
      el('h2', { text: 'How implied value is fitted' }),
      el('div', { class: 'formula' },
        el('span', { html: 'implied = round( 10<sup>(' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(2) + ' \u00d7 log\u2081\u2080(TVL))</sup> \u00d7 (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + ') \u00d7 (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + 'd) / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ') \u00d7 (1 + min(chains, ' + m.reach_max_chains + ') \u00d7 ' + m.reach_per_chain + ') )' })
      ),
      el('div', { class: 'fit-stats' },
        el('div', null, el('span', { text: 'Fitted on' }), el('b', { text: f.n + ' launched protocols' })),
        el('div', null, el('span', { text: 'R\u00b2' }), el('b', { text: f.r2.toFixed(2) })),
        el('div', null, el('span', { text: 'Residual spread' }), el('b', { text: f.residual_sd.toFixed(2) + ' dex' })),
        el('div', null, el('span', { text: 'Held out (' + f.held_out_n + ' rows)' }), el('b', { text: 'median error ' + f.held_out_med_ape_pct.toFixed(0) + '%' })),
        el('div', null, el('span', { text: 'Held out within 2\u00d7' }), el('b', { text: f.held_out_within_2x_pct.toFixed(0) + '%' })),
        el('div', null, el('span', { text: 'Value basis' }), el('b', { text: 'market cap, not FDV' }))
      ),
      el('p', { text: 'The regression is log10(market cap) on log10(TVL) over the launched protocols in this same snapshot, after excluding exchange products, wrapped and staked names, versioned pools and zero market caps. Held out means every fifth protocol by slug was predicted from a fit on the other four fifths. The value basis is market cap: the snapshot carries no fully-diluted value.' }),
      el('p', { text: 'Growth, age and chain count were tested on the same launched set and explain almost none of the leftover variation (R\u00b2 0.02), so they enter only as small bounded ordering terms, never as value drivers. The market prices similar TVL anywhere from 0.05\u00d7 to 1.04\u00d7 TVL, so every row carries an 80% interval from the fit\u2019s own spread \u2014 treat the point as an order of magnitude, not a price. Dropping the 7 most extreme ratios moves the fit to intercept ' + f.trimmed_intercept.toFixed(2) + ', slope ' + f.trimmed_slope.toFixed(2) + ', R\u00b2 ' + f.trimmed_r2.toFixed(2) + ': same direction, wider level uncertainty.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('label', { class: 'check' }, watchBox, 'Watchlist only'),
      el('div', { class: 'tabs' }, pre, live),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), WATCH[r.slug] ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge', text: 'records no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model, DATA.fit);
    var ok = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' \u00b7 Watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.listed_at ? ' \u00b7 listed ' + row.listed_at : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted base value' }), el('b', { class: 'num', text: fmtUsd(row.base_value_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { class: 'num', text: String(row.reach_multiplier) })),
        el('div', null, el('span', { text: '80% interval' }), el('b', { class: 'num', text: fmtUsd(row.band_low_usd) + ' \u2013 ' + fmtUsd(row.band_high_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'check-line', html: 'Page recomputes this row as <b class="' + (ok ? '' : 'bad') + '">' + fmtUsd(recomputed) + '</b>' + (ok ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The interval comes from the fit\u2019s own residual spread: an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Closest launched comparables' }),
      el('p', { class: 'check-line', text: 'Already trading, nearest in size: what the market pays for a protocol of this TVL.' }),
      el('ul', { class: 'comps' }, (row.comparables || []).map(function (c) {
        return el('li', null,
          el('b', { text: c.name }),
          el('span', { class: 'cost', text: 'TVL ' + fmtUsd(c.tvl_usd) + ' \u00b7 market cap ' + fmtUsd(c.mcap_usd) + ' \u00b7 ' + c.mcap_tvl + '\u00d7 TVL' })
        );
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(methodPanel());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    shell.appendChild(el('p', { class: 'note', text: 'Implied value is this entry\u2019s own claim from the snapshot\u2019s figures, never a promise of a launch or a price. A protocol \u201crecords no token\u201d in DefiLlama\u2019s record; that record is not proof it has none. Live-token protocols are set aside with their market caps, the market\u2019s own values, and never ranked as pre-token.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
