(function () {
  "use strict";

  var boardEl = document.getElementById('board');
  var timerEl = document.getElementById('timer');
  var catCountEl = document.getElementById('catCount');
  var mistakeCountEl = document.getElementById('mistakeCount');
  var statusBar = document.getElementById('statusBar');
  var statusTextEl = document.getElementById('statusText');
  var sizeSelect = document.getElementById('sizeSelect');
  var newGameBtn = document.getElementById('newGameBtn');

  var N = 7;
  var regions = [];      // regions[r][c] = region index
  var solution = [];     // solution[r] = c  (one valid answer, for generation only)
  var state = [];        // state[r][c] = 0 empty, 1 = X, 2 = cat
  var autoMarked = [];   // autoMarked[r][c] = true if X was placed automatically by a given cat
  var startTime = null;
  var timerInterval = null;
  var won = false;
  var lost = false;
  var mistakes = 0;
  var MAX_MISTAKES = 3;

  function rand(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rand(i + 1);
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- Generate a valid "no two touching, distinct rows/cols" placement ----
  function generateSolution(n) {
    var cols = [];
    var attemptsOuter = 0;
    while (attemptsOuter < 400) {
      attemptsOuter++;
      cols = tryBacktrack(n);
      if (cols) return cols;
    }
    return null;
  }

  function tryBacktrack(n) {
    var placement = new Array(n).fill(-1);
    var usedCols = new Array(n).fill(false);

    function backtrack(row) {
      if (row === n) return true;
      var order = shuffle([...Array(n).keys()]);
      for (var idx = 0; idx < order.length; idx++) {
        var c = order[idx];
        if (usedCols[c]) continue;
        if (row > 0) {
          var prevC = placement[row - 1];
          if (Math.abs(prevC - c) <= 1) continue; // king-move adjacency to previous row
        }
        placement[row] = c;
        usedCols[c] = true;
        if (backtrack(row + 1)) return true;
        placement[row] = -1;
        usedCols[c] = false;
      }
      return false;
    }

    if (backtrack(0)) return placement;
    return null;
  }

  // ---- Grow N connected regions, one per seed cell, to cover the whole board ----
  function generateRegions(n, sol) {
    var grid = [];
    for (var r = 0; r < n; r++) { grid.push(new Array(n).fill(-1)); }

    var frontiers = []; // frontiers[i] = array of {r,c} candidate cells for region i
    for (var i = 0; i < n; i++) {
      grid[i][sol[i]] = i;
      frontiers.push(neighborsOf4(i, sol[i], n));
    }

    var filled = n;
    var total = n * n;
    var order = [...Array(n).keys()];

    while (filled < total) {
      shuffle(order);
      var progressed = false;
      for (var oi = 0; oi < order.length; oi++) {
        var region = order[oi];
        var f = frontiers[region];
        // drop cells that are already taken
        while (f.length && grid[f[f.length - 1].r][f[f.length - 1].c] !== -1) { f.pop(); }
        if (!f.length) continue;
        // pick random candidate from the frontier
        var pick = rand(f.length);
        var cell = f[pick];
        f.splice(pick, 1);
        if (grid[cell.r][cell.c] !== -1) continue;
        grid[cell.r][cell.c] = region;
        filled++;
        progressed = true;
        var newNeighbors = neighborsOf4(cell.r, cell.c, n);
        for (var ni = 0; ni < newNeighbors.length; ni++) {
          if (grid[newNeighbors[ni].r][newNeighbors[ni].c] === -1) {
            frontiers[region].push(newNeighbors[ni]);
          }
        }
        if (filled >= total) break;
      }
      if (!progressed) {
        // some region has no reachable frontier (shouldn't normally happen) — assign any
        // remaining empty cell to the nearest already-adjacent region, else random region
        for (var r2 = 0; r2 < n; r2++) {
          for (var c2 = 0; c2 < n; c2++) {
            if (grid[r2][c2] === -1) {
              var nb = neighborsOf4(r2, c2, n);
              var assigned = false;
              for (var k = 0; k < nb.length; k++) {
                if (grid[nb[k].r][nb[k].c] !== -1) {
                  grid[r2][c2] = grid[nb[k].r][nb[k].c];
                  assigned = true;
                  break;
                }
              }
              if (!assigned) grid[r2][c2] = rand(n);
              filled++;
            }
          }
        }
      }
    }
    return grid;
  }

  function neighborsOf4(r, c, n) {
    var out = [];
    if (r > 0) out.push({ r: r - 1, c: c });
    if (r < n - 1) out.push({ r: r + 1, c: c });
    if (c > 0) out.push({ r: r, c: c - 1 });
    if (c < n - 1) out.push({ r: r, c: c + 1 });
    return out;
  }

  // ---- Build a fresh puzzle ----
  function newPuzzle() {
    N = parseInt(sizeSelect.value, 10);
    var sol = generateSolution(N);
    if (!sol) {
      sol = generateSolution(N); // extremely unlikely fallback
    }
    solution = sol;
    regions = generateRegions(N, sol);
    state = [];
    autoMarked = [];
    for (var r = 0; r < N; r++) {
      state.push(new Array(N).fill(0));
      autoMarked.push(new Array(N).fill(false));
    }
    won = false;
    lost = false;
    mistakes = 0;
    boardEl.classList.remove('locked');
    startTime = Date.now();
    renderBoard();
    updateStatus("Tap a cell to cycle: empty → ✕ → ", "info");
    updateCatCount();
    updateMistakeCount();
    restartTimer();
  }

  function renderBoard() {
    boardEl.style.gridTemplateColumns = "repeat(" + N + ", 1fr)";
    boardEl.style.width = "min(92vw, " + (N * 62) + "px)";
    boardEl.innerHTML = "";
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var cell = document.createElement('div');
        cell.className = "cell reg-" + regions[r][c];
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', 'row ' + (r + 1) + ' column ' + (c + 1));
        cell.addEventListener('click', onCellClick);
        boardEl.appendChild(cell);
      }
    }
    paintCells();
  }

  function paintCells() {
    var conflicts = findConflicts();
    var cells = boardEl.children;
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var idx = r * N + c;
        var cellEl = cells[idx];
        var v = state[r][c];
        cellEl.innerHTML = "";
        if (v === 1) {
          var x = document.createElement('span');
          x.className = "mark x-mark";
          x.textContent = "✕";
          cellEl.appendChild(x);
        } else if (v === 2) {
          var photo = document.createElement('img');
          photo.className = "mark photo-mark";
          photo.src = "photo_2026-09-17_13-15-01.jpg";
          photo.alt = "Player photo";
          cellEl.appendChild(photo);
        }
        cellEl.classList.toggle('conflict', v === 2 && conflicts.has(r + "," + c));
      }
    }
  }

  function onCellClick(e) {
    if (won || lost) return;
    var r = parseInt(e.currentTarget.dataset.r, 10);
    var c = parseInt(e.currentTarget.dataset.c, 10);
    var v = state[r][c];

    if (v === 0) {
      state[r][c] = 1; // -> X
    } else if (v === 1) {
      state[r][c] = 2; // -> cat
      autoMark(r, c);
      if (findConflicts().has(r + "," + c)) registerMistake();
    } else {
      // cat -> clear the cat and anything this cat auto-marked
      state[r][c] = 0;
      clearAutoMarks(r, c);
    }
    updateCatCount();
    paintCells();
    if (!lost) checkWin();
  }

  function registerMistake() {
    mistakes++;
    updateMistakeCount();
    if (mistakes >= MAX_MISTAKES) {
      lost = true;
      clearInterval(timerInterval);
      boardEl.classList.add('locked');
      updateStatus("Game over — 3 mistakes. Cats need a gentler touch. Try a new puzzle.", "lose");
    }
  }

  function updateMistakeCount() {
    mistakeCountEl.textContent = mistakes + "/" + MAX_MISTAKES;
  }

  function autoMark(r, c) {
    for (var cc = 0; cc < N; cc++) {
      if (cc !== c && state[r][cc] === 0) { state[r][cc] = 1; autoMarked[r][cc] = true; }
    }
    for (var rr = 0; rr < N; rr++) {
      if (rr !== r && state[rr][c] === 0) { state[rr][c] = 1; autoMarked[rr][c] = true; }
    }
    var reg = regions[r][c];
    for (var rr2 = 0; rr2 < N; rr2++) {
      for (var cc2 = 0; cc2 < N; cc2++) {
        if (regions[rr2][cc2] === reg && !(rr2 === r && cc2 === c) && state[rr2][cc2] === 0) {
          state[rr2][cc2] = 1; autoMarked[rr2][cc2] = true;
        }
      }
    }
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && state[nr][nc] === 0) {
          state[nr][nc] = 1; autoMarked[nr][nc] = true;
        }
      }
    }
  }

  function clearAutoMarks(r, c) {
    // Simple, predictable behavior: clear ALL auto-marks board-wide, then
    // re-apply auto-marks for every cat still on the board.
    for (var r2 = 0; r2 < N; r2++) {
      for (var c2 = 0; c2 < N; c2++) {
        if (autoMarked[r2][c2]) {
          state[r2][c2] = 0;
          autoMarked[r2][c2] = false;
        }
      }
    }
    for (var r3 = 0; r3 < N; r3++) {
      for (var c3 = 0; c3 < N; c3++) {
        if (state[r3][c3] === 2) autoMark(r3, c3);
      }
    }
  }

  function findConflicts() {
    var cats = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (state[r][c] === 2) cats.push({ r: r, c: c });
      }
    }
    var bad = new Set();
    for (var i = 0; i < cats.length; i++) {
      for (var j = 0; j < cats.length; j++) {
        if (i === j) continue;
        var a = cats[i], b = cats[j];
        var sameRow = a.r === b.r;
        var sameCol = a.c === b.c;
        var sameRegion = regions[a.r][a.c] === regions[b.r][b.c];
        var touching = Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1;
        if (sameRow || sameCol || sameRegion || touching) {
          bad.add(a.r + "," + a.c);
          bad.add(b.r + "," + b.c);
        }
      }
    }
    return bad;
  }

  function updateCatCount() {
    var count = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (state[r][c] === 2) count++;
    catCountEl.textContent = count + "/" + N;
  }

  function checkWin() {
    var count = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (state[r][c] === 2) count++;
    if (count !== N) return;
    var conflicts = findConflicts();
    if (conflicts.size > 0) return;

    won = true;
    clearInterval(timerInterval);
    updateStatus("Every cat found its territory! 🐾 " + timerEl.textContent, "win");
  }

  function updateStatus(text, cls) {
    statusTextEl.textContent = text;
    statusBar.className = "status-bar" + (cls ? " " + cls : "");
  }

  function restartTimer() {
    clearInterval(timerInterval);
    timerEl.textContent = "00:00";
    timerInterval = setInterval(function () {
      var secs = Math.floor((Date.now() - startTime) / 1000);
      var mm = String(Math.floor(secs / 60)).padStart(2, '0');
      var ss = String(secs % 60).padStart(2, '0');
      timerEl.textContent = mm + ":" + ss;
    }, 1000);
  }

  newGameBtn.addEventListener('click', newPuzzle);
  sizeSelect.addEventListener('change', newPuzzle);

  newPuzzle();
})();
