
(() => {
'use strict';

/* ═══════════════════════════════════════════════════════
   WEB AUDIO — lightweight synthetic sound cues
═══════════════════════════════════════════════════════ */
let _actx = null;
function getACtx() {
    if (!_actx) {
        try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return _actx;
}
function playTone(freq, type, duration, gainVal, decay) {
    const ctx = getACtx(); if (!ctx) return;
    try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
        g.gain.setValueAtTime(gainVal, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + duration);
    } catch(e) {}
}
function sndMove() {
    playTone(520, 'sine', 0.12, 0.18, 0.10);
    setTimeout(() => playTone(660, 'sine', 0.08, 0.10, 0.06), 60);
}
function sndCapture() {
    playTone(220, 'sawtooth', 0.06, 0.22, 0.06);
    playTone(330, 'square',   0.15, 0.14, 0.14);
    setTimeout(() => playTone(180, 'sine', 0.12, 0.10, 0.10), 55);
}
function sndCheck() {
    playTone(880, 'square', 0.08, 0.18, 0.08);
    setTimeout(() => playTone(740, 'square', 0.12, 0.15, 0.10), 80);
    setTimeout(() => playTone(880, 'square', 0.08, 0.12, 0.08), 180);
}

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
const S = {
    game:'chess', mode:'2player', diff:'medium',
    board:[], cur:'white',
    sel:null, valid:[],
    hist:[], lastMove:null,
    ep:null, cast:{wK:true,wQ:true,bK:true,bQ:true},
    inCheck:null, over:false, result:null,
    mustJump:false, jumping:null,
    aiColor:'black', aiThinking:false,
    // Chess draw tracking
    halfMoveClock:0,          // 50-move rule (counts half-moves since pawn move / capture)
    positionHashes:[],        // 3-fold repetition
    // Checkers draw
    drawCnt:0, drawSide:null,
    // Board flip
    flipped: false
};

/* ═══════════════════════════════════════════════════════
   DOM
═══════════════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const boardEl = $('board');
const badge   = $('badge');
const mcEl    = $('mc');
const capEl   = $('capRow');
const mlogEl  = $('mlog');
const diffBox = $('diffBox');
const drawEl  = $('drawInfo');

/* ═══════════════════════════════════════════════════════
   BOARD SETUP
═══════════════════════════════════════════════════════ */
function setup() {
    S.board = Array.from({length:8}, () => Array(8).fill(null));
    Object.assign(S, {
        cur: S.game==='chess'?'white':'red',
        sel:null, valid:[], hist:[], lastMove:null,
        ep:null, cast:{wK:true,wQ:true,bK:true,bQ:true},
        inCheck:null, over:false, result:null,
        mustJump:false, jumping:null,
        aiThinking:false,
        halfMoveClock:0, positionHashes:[],
        drawCnt:0, drawSide:null
    });
    if (S.game==='chess') {
        const back = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
        for (let c=0;c<8;c++) {
            S.board[0][c] = {t:back[c], c:'black'};
            S.board[1][c] = {t:'pawn',  c:'black'};
            S.board[6][c] = {t:'pawn',  c:'white'};
            S.board[7][c] = {t:back[c], c:'white'};
        }
        S.positionHashes.push(boardHash(S.board, S.cur, S.ep, S.cast));
    } else {
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
            if ((r+c)%2===1) {
                if (r<3) S.board[r][c] = {t:'man',c:'black'};
                else if (r>4) S.board[r][c] = {t:'man',c:'red'};
            }
        }
    }
    coords(); render(); ui(); mlog();
    if (S.mode==='ai' && S.cur===S.aiColor) schedAI();
}

/* ═══════════════════════════════════════════════════════
   BOARD HASH — for 3-fold repetition
═══════════════════════════════════════════════════════ */
function boardHash(bd, turn, ep, cast) {
    let h = turn +
        (cast.wK?'1':'0')+(cast.wQ?'1':'0')+
        (cast.bK?'1':'0')+(cast.bQ?'1':'0')+
        (ep ? ep[0]+','+ep[1] : '-');
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p = bd[r][c];
        h += p ? p.c[0]+p.t[0] : '.';
    }
    return h;
}

/* ═══════════════════════════════════════════════════════
   COORDINATES
═══════════════════════════════════════════════════════ */
function coords() {
    const files = S.game==='chess' ? 'abcdefgh'.split('') : '12345678'.split('');
    const ranks  = '87654321'.split('');
    if (S.flipped) {
        $('ct').innerHTML = $('cb').innerHTML = [...files].reverse().map(x=>`<span>${x}</span>`).join('');
        $('cl').innerHTML = $('cr').innerHTML = [...ranks].reverse().map(x=>`<span>${x}</span>`).join('');
    } else {
        $('ct').innerHTML = $('cb').innerHTML = files.map(x=>`<span>${x}</span>`).join('');
        $('cl').innerHTML = $('cr').innerHTML = ranks.map(x=>`<span>${x}</span>`).join('');
    }
}

/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
const CU = {
    white:{ king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' },
    black:{ king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟' }
};

function pieceSel(col, type) {
    const span = document.createElement('span');
    span.className = 'piece ' + col;
    span.textContent = CU[col][type];
    return span;
}
function pieceCap(col, type) {
    const span = document.createElement('span');
    span.className = 'piece ' + col;
    span.style.cssText = 'font-size:18px;line-height:1';
    span.textContent = CU[col][type];
    return span;
}

function render() {
    boardEl.innerHTML = '';
    boardEl.className = 'board ' + S.game + (S.flipped ? ' flipped' : '');

    // Compute which squares have must-jump pieces (checkers)
    const mustJumpSquares = new Set();
    if (S.game==='checkers' && S.mustJump) {
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
            const p = S.board[r][c];
            if (p && p.c===S.cur && ckJumps(r,c,p,S.board).length > 0) {
                mustJumpSquares.add(r*8+c);
            }
        }
    }

    const order = S.flipped
        ? Array.from({length:64},(_,i)=>[7-Math.floor(i/8), 7-(i%8)])
        : Array.from({length:64},(_,i)=>[Math.floor(i/8), i%8]);

    for (const [r,c] of order) {
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r+c)%2===0 ? 'light':'dark');
        if (S.sel && S.sel[0]===r && S.sel[1]===c) sq.classList.add('selected');
        if (S.lastMove) {
            if (S.lastMove[0]===r && S.lastMove[1]===c) sq.classList.add('last-from');
            if (S.lastMove[2]===r && S.lastMove[3]===c) sq.classList.add('last-to');
        }
        const vm = S.valid.find(m=>m[0]===r&&m[1]===c);
        if (vm) sq.classList.add(vm[2] ? 'valid-capture' : 'valid-move');

        if (mustJumpSquares.has(r*8+c) && !S.sel) sq.classList.add('must-jump-piece');

        const p = S.board[r][c];
        if (p) {
            if (S.game==='chess') {
                sq.appendChild(pieceSel(p.c, p.t));
            } else {
                const d = document.createElement('div');
                d.className = 'checker-piece '+p.c + (p.t==='king'?' king':'');
                sq.appendChild(d);
            }
            if (S.inCheck && p.t==='king' && p.c===S.inCheck) sq.classList.add('in-check');
        }
        sq.addEventListener('click', () => click(r,c));
        boardEl.appendChild(sq);
    }
}

/* ═══════════════════════════════════════════════════════
   UI (badge / captured / move log / draw info)
═══════════════════════════════════════════════════════ */
function ui() {
    badge.className = 'turn-badge';
    badge.style.cssText = '';
    drawEl.textContent = '';

    if (S.over) {
        badge.textContent = S.result||'Game Over';
        badge.style.background='#ffd700'; badge.style.color='#222';
        mcEl.textContent = S.hist.length;
        updateScoreBars();
        return;
    }
    if (S.game==='chess') {
        badge.classList.add(S.cur==='white'?'tw':'tb');
        badge.textContent = (S.cur==='white'?'White':'Black')+"'s turn";
        if (S.inCheck) badge.textContent += ' ⚠ CHECK';
        const halfLeft = 100 - S.halfMoveClock;
        if (S.halfMoveClock >= 80) drawEl.textContent = `⏱ ${halfLeft} half-moves to 50-move draw`;
    } else {
        badge.classList.add(S.cur==='red'?'tr':'tb');
        badge.textContent = (S.cur==='red'?'Red':'Black')+"'s turn";
        if (S.mustJump) badge.textContent += ' (must jump)';
    }
    mcEl.textContent = S.hist.length;
    // Feature 2: update score bars instead of old capRow
    updateScoreBars();
}

/* Feature 2: Score bars — captured pieces split above (P2/AI) and below (P1) the board */
function updateScoreBars() {
    const isChess = S.game === 'chess';
    const isAI    = S.mode === 'ai';
    const lbTop   = $('sbLabelTop');
    const lbBot   = $('sbLabelBot');
    const capTop  = $('sbCapsTop');
    const capBot  = $('sbCapsBot');
    const scTop   = $('sbScoreTop');
    const scBot   = $('sbScoreBot');

    lbTop.textContent = isAI ? (isChess?'AI (Black)':'AI (Black)') : (isChess?'Black':'Black');
    lbBot.textContent = isChess ? 'Player (White)' : 'Player (Red)';

    capTop.innerHTML=''; capBot.innerHTML='';

    if (isChess) {
        const init={white:{pawn:8,rook:2,knight:2,bishop:2,queen:1,king:1},black:{pawn:8,rook:2,knight:2,bishop:2,queen:1,king:1}};
        const cur={};
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
            const p=S.board[r][c]; if(!p) continue;
            (cur[p.c]=cur[p.c]||{})[p.t] = ((cur[p.c]||{})[p.t]||0)+1;
        }
        const CVAL={pawn:100,knight:320,bishop:330,rook:500,queen:900,king:0};
        let wScore=0,bScore=0;
        // Pieces captured BY white (black pieces missing) → show above (P2 lost them)
        // Pieces captured BY black (white pieces missing) → show below (P1 lost them)... wait,
        // Convention: show CAPTURED pieces near the player who captured them.
        // P1 (white) captures → show at bottom panel (white's side), representing black pieces taken
        // P2/AI (black) captures → show at top panel
        for (const [col,types] of Object.entries(init)) {
            for (const [tp,initCnt] of Object.entries(types)) {
                const lost = initCnt - (cur[col]?.[tp]||0);
                for (let i=0;i<lost;i++) {
                    const sp=document.createElement('span');
                    sp.className='piece '+col;
                    sp.style.cssText='font-size:14px;line-height:1';
                    sp.textContent=CU[col][tp];
                    if (col==='black') {
                        capBot.appendChild(sp); // white captured these → show at bottom
                        wScore += CVAL[tp];
                    } else {
                        capTop.appendChild(sp); // black/AI captured these → show at top
                        bScore += CVAL[tp];
                    }
                }
            }
        }
        scBot.textContent = wScore>bScore ? `+${wScore-bScore}` : '';
        scTop.textContent = bScore>wScore ? `+${bScore-wScore}` : '';
    } else {
        // Checkers: count remaining pieces
        let red=0,blk=0;
        for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
            if (S.board[r][c]?.c==='red') red++;
            if (S.board[r][c]?.c==='black') blk++;
        }
        const capturedRed = 12-red, capturedBlk = 12-blk;
        // P1 (red) captured black pieces → show at bottom
        for (let i=0;i<capturedBlk;i++) {
            const d=document.createElement('div');
            d.className='checker-piece black'; d.style.cssText='width:18px;height:18px;display:inline-block;margin:1px';
            capBot.appendChild(d);
        }
        // P2/AI (black) captured red pieces → show at top
        for (let i=0;i<capturedRed;i++) {
            const d=document.createElement('div');
            d.className='checker-piece red'; d.style.cssText='width:18px;height:18px;display:inline-block;margin:1px';
            capTop.appendChild(d);
        }
        scBot.textContent = capturedBlk>0 ? `+${capturedBlk}` : '';
        scTop.textContent = capturedRed>0 ? `+${capturedRed}` : '';
    }
}

function captured() {
    const init = S.game==='chess'
        ? {white:{pawn:8,rook:2,knight:2,bishop:2,queen:1,king:1},black:{pawn:8,rook:2,knight:2,bishop:2,queen:1,king:1}}
        : {red:{man:12,king:0},black:{man:12,king:0}};
    const cur = {};
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=S.board[r][c]; if(!p) continue;
        (cur[p.c]=cur[p.c]||{})[p.t] = ((cur[p.c]||{})[p.t]||0)+1;
    }
    const out=[];
    for (const col in init) for (const tp in init[col]) {
        const d = init[col][tp] - (cur[col]?.[tp]||0);
        for (let i=0;i<d;i++) out.push({c:col,t:tp});
    }
    return out;
}

function mlog() {
    // Feature 2: Two-column move log — P1 (white/red) left, P2/AI (black) right
    const isChess = S.game==='chess';
    const hdr1 = $('mlogHdr1');
    const hdr2 = $('mlogHdr2');
    hdr1.textContent = isChess ? 'White' : 'Red';
    hdr2.textContent = (S.mode==='ai') ? (isChess?'AI (Black)':'AI (Black)') : (isChess?'Black':'Black');

    const grid = $('mlogGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!S.hist.length) { grid.innerHTML='<span style="color:#666;font-size:.72rem;grid-column:1/-1">Ready</span>'; return; }

    // Pair moves into rows: index 0,2,4... = P1; index 1,3,5... = P2/AI
    const p1Cls = 'mlog-cell p1c';
    const p2Cls = S.mode==='ai' ? 'mlog-cell ai-c' : 'mlog-cell p2c';

    const moves = S.hist.map(h=>h.n);
    // Build rows: pair [0,1], [2,3], ...
    for (let i=0; i<moves.length; i+=2) {
        const c1=document.createElement('div');
        c1.className=p1Cls;
        c1.textContent=moves[i]||'';
        grid.appendChild(c1);

        const c2=document.createElement('div');
        c2.className=p2Cls;
        c2.textContent=moves[i+1]||'…';
        grid.appendChild(c2);
    }
    const mlogEl2=$('mlog');
    if(mlogEl2) mlogEl2.scrollTop=mlogEl2.scrollHeight;
}

/* ═══════════════════════════════════════════════════════
   CLICK / SELECT
═══════════════════════════════════════════════════════ */
function click(r,c) {
    if (S.over || S.aiThinking) return;
    if (S.mode==='ai' && S.cur===S.aiColor) return;
    const p = S.board[r][c];
    if (S.jumping) {
        if (S.jumping[0]===r && S.jumping[1]===c) {
            S.sel=[r,c]; S.valid=ckMoves(r,c,true); render(); return;
        }
        const m = S.valid.find(m=>m[0]===r&&m[1]===c);
        if (m && m[2]) { doMove(S.jumping[0],S.jumping[1],r,c,m); return; }
        return;
    }
    if (S.sel) {
        const m = S.valid.find(m=>m[0]===r&&m[1]===c);
        if (m) { doMove(S.sel[0],S.sel[1],r,c,m); return; }
        if (p && p.c===S.cur) { sel(r,c); return; }
        S.sel=null; S.valid=[]; render(); return;
    }
    if (p && p.c===S.cur) sel(r,c);
}

function sel(r,c) { S.sel=[r,c]; S.valid=getMoves(r,c); render(); }
function getMoves(r,c) {
    return S.game==='chess' ? chMoves(r,c) : ckMoves(r,c,false);
}

/* ═══════════════════════════════════════════════════════
   CHESS — MOVE GENERATION
═══════════════════════════════════════════════════════ */
function chMoves(r,c) {
    const p=S.board[r][c];
    if (!p||p.c!==S.cur) return [];
    return rawChMoves(r,c,p,S.board,S.ep,S.cast)
        .filter(m => !inCheckAfter(p.c, S.board, r,c,m));
}

function rawChMoves(r,c,p,bd,ep,cast) {
    const m=[];
    const col=p.c;
    if (p.t==='pawn') {
        const d=col==='white'?-1:1, st=col==='white'?6:1, pr=col==='white'?0:7;
        if (r+d>=0&&r+d<8&&!bd[r+d][c]) {
            m.push([r+d,c,false,r+d===pr?'prom':null]);
            if (r===st&&!bd[r+2*d][c]) m.push([r+2*d,c,false,'dbl']);
        }
        for (const dc of[-1,1]) {
            const nr=r+d,nc=c+dc;
            if (nr>=0&&nr<8&&nc>=0&&nc<8) {
                if (bd[nr][nc]&&bd[nr][nc].c!==col) m.push([nr,nc,true,nr===pr?'prom':null]);
                if (ep&&ep[0]===nr&&ep[1]===nc) m.push([nr,nc,true,'ep']);
            }
        }
    } else if (p.t==='knight') {
        for (const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const nr=r+dr,nc=c+dc;
            if (nr>=0&&nr<8&&nc>=0&&nc<8) {
                const t=bd[nr][nc];
                if (!t||t.c!==col) m.push([nr,nc,!!t,null]);
            }
        }
    } else if (p.t==='bishop') slides(m,r,c,col,bd,[[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (p.t==='rook')   slides(m,r,c,col,bd,[[-1,0],[1,0],[0,-1],[0,1]]);
    else if (p.t==='queen')  slides(m,r,c,col,bd,[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (p.t==='king') {
        for (const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const nr=r+dr,nc=c+dc;
            if (nr>=0&&nr<8&&nc>=0&&nc<8) { const t=bd[nr][nc]; if(!t||t.c!==col) m.push([nr,nc,!!t,null]); }
        }
        if (cast) {
            const row=col==='white'?7:0;
            if (r===row&&c===4&&!sqAtk(row,4,col,bd)) {
                const ks=col==='white'?cast.wK:cast.bK;
                const qs=col==='white'?cast.wQ:cast.bQ;
                if (ks&&!bd[row][5]&&!bd[row][6]&&!sqAtk(row,5,col,bd)&&!sqAtk(row,6,col,bd))
                    m.push([row,6,false,'KS']);
                if (qs&&!bd[row][3]&&!bd[row][2]&&!bd[row][1]&&!sqAtk(row,3,col,bd)&&!sqAtk(row,2,col,bd))
                    m.push([row,2,false,'QS']);
            }
        }
    }
    return m;
}

function slides(arr,r,c,col,bd,dirs) {
    for (const[dr,dc]of dirs) {
        let nr=r+dr,nc=c+dc;
        while (nr>=0&&nr<8&&nc>=0&&nc<8) {
            const t=bd[nr][nc];
            if (t){ if(t.c!==col) arr.push([nr,nc,true,null]); break; }
            arr.push([nr,nc,false,null]); nr+=dr; nc+=dc;
        }
    }
}

function sqAtk(r,c,defCol,bd) {
    const atk=defCol==='white'?'black':'white';
    for (let rr=0;rr<8;rr++) for (let cc=0;cc<8;cc++) {
        const p=bd[rr][cc]; if(!p||p.c!==atk) continue;
        if (rawChMoves(rr,cc,p,bd,null,null).some(m=>m[0]===r&&m[1]===c)) return true;
    }
    return false;
}

function kingPos(col,bd) {
    for (let r=0;r<8;r++) for (let c=0;c<8;c++)
        if (bd[r][c]?.t==='king'&&bd[r][c].c===col) return [r,c];
    return null;
}

function simMove(bd,fr,fc,tr,tc,sp) {
    const b=bd.map(r=>r.map(c=>c?{...c}:null));
    const p=b[fr][fc];
    b[tr][tc]=p; b[fr][fc]=null;
    if (sp==='ep') { const cr=p.c==='white'?tr+1:tr-1; b[cr][tc]=null; }
    if (sp==='KS') { b[tr][5]=b[tr][7]; b[tr][7]=null; }
    if (sp==='QS') { b[tr][3]=b[tr][0]; b[tr][0]=null; }
    if (sp==='prom') b[tr][tc]={t:'queen',c:p.c};
    return b;
}

/* Compute updated castling rights after a simulated move */
function nextCast(cast, bd, fr, fc, tr, tc, piece) {
    const c = {...cast};
    // King moves
    if (piece.t==='king') {
        if (piece.c==='white') { c.wK=false; c.wQ=false; }
        else { c.bK=false; c.bQ=false; }
    }
    // Rook moves from its home square
    if (piece.t==='rook') {
        if (fr===7&&fc===0) c.wQ=false;
        if (fr===7&&fc===7) c.wK=false;
        if (fr===0&&fc===0) c.bQ=false;
        if (fr===0&&fc===7) c.bK=false;
    }
    // ── FIX: Capture on a corner square destroys that corner's castling rights ──
    // Even if the rook there never moved, if it's captured, rights are gone.
    if (bd[tr][tc]) { // there's a piece being captured
        if (tr===7&&tc===0) c.wQ=false;
        if (tr===7&&tc===7) c.wK=false;
        if (tr===0&&tc===0) c.bQ=false;
        if (tr===0&&tc===7) c.bK=false;
    }
    return c;
}

/* Compute next en-passant square after a move */
function nextEp(piece, fr, tr, tc, sp) {
    if (sp==='dbl') return [piece.c==='white'?tr+1:tr-1, tc];
    return null;
}

function inCheckAfter(col,bd,fr,fc,m) {
    const b=simMove(bd,fr,fc,m[0],m[1],m[3]);
    const kp=kingPos(col,b);
    if (!kp) return true;
    return sqAtk(kp[0],kp[1],col,b);
}

function isInCheck(col,bd) {
    const kp=kingPos(col,bd);
    if (!kp) return false;
    return sqAtk(kp[0],kp[1],col,bd);
}

function legalMoves(col,bd,ep,cast) {
    const all=[];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c]; if(!p||p.c!==col) continue;
        rawChMoves(r,c,p,bd,ep,cast).forEach(m=>{
            if (!inCheckAfter(col,bd,r,c,m)) all.push({fr:r,fc:c,m});
        });
    }
    return all;
}

/* ═══════════════════════════════════════════════════════
   CHESS — DRAW DETECTION
═══════════════════════════════════════════════════════ */
function insufficientMaterial(bd) {
    const pieces = [];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p = bd[r][c]; if (p) pieces.push(p);
    }
    // K vs K
    if (pieces.length===2) return true;
    // K+B vs K or K+N vs K
    if (pieces.length===3) {
        const minor = pieces.find(p=>p.t==='bishop'||p.t==='knight');
        if (minor) return true;
    }
    // K+B vs K+B same color squares
    if (pieces.length===4) {
        const bishops = pieces.filter(p=>p.t==='bishop');
        if (bishops.length===2 && bishops[0].c!==bishops[1].c) {
            // find their squares
            let sq=[];
            for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
                if (bd[r][c]?.t==='bishop') sq.push((r+c)%2);
            }
            if (sq[0]===sq[1]) return true;
        }
    }
    return false;
}

function checkThreefold() {
    const last = S.positionHashes[S.positionHashes.length-1];
    let count = 0;
    for (const h of S.positionHashes) { if (h===last) count++; }
    return count >= 3;
}

/* ═══════════════════════════════════════════════════════
   CHECKERS — MOVE GENERATION
═══════════════════════════════════════════════════════ */
function ckMoves(r,c,jumpsOnly) {
    const p=S.board[r][c];
    if (!p||p.c!==S.cur) return [];
    if (S.mustJump||jumpsOnly||S.jumping) return ckJumps(r,c,p,S.board);
    const j=ckJumps(r,c,p,S.board);
    return j.length ? j : ckSimple(r,c,p,S.board);
}

function ckDirs(p) {
    return p.t==='king' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : p.c==='red'   ? [[-1,-1],[-1,1]]
        :                  [[1,-1],[1,1]];
}

function ckSimple(r,c,p,bd) {
    return ckDirs(p)
        .map(([dr,dc])=>[r+dr,c+dc])
        .filter(([nr,nc])=>nr>=0&&nr<8&&nc>=0&&nc<8&&!bd[nr][nc])
        .map(([nr,nc])=>[nr,nc,false]);
}

function ckJumps(r,c,p,bd) {
    const out=[];
    for (const[dr,dc] of ckDirs(p)) {
        const mr=r+dr,mc=c+dc, lr=r+2*dr,lc=c+2*dc;
        if (lr<0||lr>=8||lc<0||lc>=8) continue;
        const mid=bd[mr]?.[mc];
        // FIX: removed non-standard restriction — men CAN jump kings
        if (mid && mid.c!==p.c && !bd[lr][lc]) {
            out.push([lr,lc,true]);
        }
    }
    return out;
}

function allCkJumps(col,bd) {
    const res=[];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c];
        if (p&&p.c===col) ckJumps(r,c,p,bd).forEach(m=>res.push({fr:r,fc:c,m}));
    }
    return res;
}

function allCkMoves(col,bd) {
    const caps=[], simps=[];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c]; if(!p||p.c!==col) continue;
        ckJumps(r,c,p,bd).forEach(m=>caps.push({fr:r,fc:c,m}));
        ckSimple(r,c,p,bd).forEach(m=>simps.push({fr:r,fc:c,m}));
    }
    return caps.length ? caps : simps;
}

function hasCkMoves(col,bd) {
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c]; if(!p||p.c!==col) continue;
        if (ckJumps(r,c,p,bd).length||ckSimple(r,c,p,bd).length) return true;
    }
    return false;
}

/* ═══════════════════════════════════════════════════════
   EXECUTE MOVE
═══════════════════════════════════════════════════════ */
function doMove(fr,fc,tr,tc,m) {
    const sp=m[3]||null;
    const p=S.board[fr][fc];
    const cap=S.board[tr][tc];
    const rec={fr,fc,tr,tc,p:{...p},cap:cap?{...cap}:null,player:S.cur,
               ep:S.ep,cast:{...S.cast},n:'',sp,
               halfMoveClock:S.halfMoveClock};
    S.board[tr][tc]=p; S.board[fr][fc]=null;
    S.lastMove=[fr,fc,tr,tc];

    let isCapture = !!cap;
    let isPawnMove = p.t==='pawn';

    if (S.game==='chess') {
        if (sp==='ep') {
            const cr=p.c==='white'?tr+1:tr-1;
            rec.cap=S.board[cr][tc]?{...S.board[cr][tc]}:null;
            S.board[cr][tc]=null;
            isCapture=true;
        }
        if (sp==='KS') { S.board[tr][5]=S.board[tr][7]; S.board[tr][7]=null; }
        if (sp==='QS') { S.board[tr][3]=S.board[tr][0]; S.board[tr][0]=null; }

        // FIX: update castling rights, including capture-on-corner
        S.cast = nextCast(S.cast, S.board, fr, fc, tr, tc, p);
        // (board[tr][tc] was already moved, check original capture)
        if (cap) {
            if (tr===7&&tc===0) S.cast.wQ=false;
            if (tr===7&&tc===7) S.cast.wK=false;
            if (tr===0&&tc===0) S.cast.bQ=false;
            if (tr===0&&tc===7) S.cast.bK=false;
        }
        S.ep = nextEp(p, fr, tr, tc, sp);

        // 50-move rule clock
        if (isCapture||isPawnMove) S.halfMoveClock=0;
        else S.halfMoveClock++;

        if (sp==='prom') { showProm(tr,tc,p.c,rec); return; }
    } else {
        if (m[2]) {
            const mr=(fr+tr)/2, mc2=(fc+tc)/2;
            rec.cap=S.board[mr][mc2]?{...S.board[mr][mc2]}:null;
            S.board[mr][mc2]=null;
            isCapture=true;
        }
        // FIX: Kinging terminates the turn — crown and stop jump sequence
        if ((p.c==='red'&&tr===0 || p.c==='black'&&tr===7) && p.t==='man') {
            S.board[tr][tc]={t:'king',c:p.c}; rec.sp='king';
            // Turn terminates — skip further jump checks for this piece
            rec.n=notation(fr,fc,tr,tc,p,rec.cap,sp);
            S.hist.push(rec);
            sndCapture();
            finishCheckers(m, p, tr, tc, true /* kinged, force end turn */);
            return;
        }
    }
    rec.n=notation(fr,fc,tr,tc,p,rec.cap,sp);
    S.hist.push(rec);
    if (isCapture) sndCapture();
    else sndMove();
    finish(m,p,tr,tc);
}

function finish(m,p,tr,tc) {
    S.sel=null; S.valid=[];
    if (S.game==='chess') {
        S.cur=S.cur==='white'?'black':'white';
        S.inCheck=isInCheck(S.cur,S.board)?S.cur:null;
        if (S.inCheck) sndCheck();

        // Record position hash for repetition tracking
        const hash = boardHash(S.board, S.cur, S.ep, S.cast);
        S.positionHashes.push(hash);

        const moves = legalMoves(S.cur,S.board,S.ep,S.cast);
        if (!moves.length) {
            S.over=true;
            S.result=S.inCheck?`Checkmate! ${S.cur==='white'?'Black':'White'} wins`:'Stalemate – Draw';
        } else if (S.halfMoveClock>=100) {
            S.over=true; S.result='Draw – 50-move rule';
        } else if (checkThreefold()) {
            S.over=true; S.result='Draw – 3-fold repetition';
        } else if (insufficientMaterial(S.board)) {
            S.over=true; S.result='Draw – Insufficient material';
        }
    } else {
        finishCheckers(m, p, tr, tc, false);
        return;
    }
    render(); ui(); mlog();
    if (S.mode==='ai'&&!S.over&&S.cur===S.aiColor) schedAI();
}

function finishCheckers(m, p, tr, tc, forcedEndTurn) {
    S.sel=null; S.valid=[];
    if (!forcedEndTurn && m[2]) {
        const lp=S.board[tr][tc];
        const more=ckJumps(tr,tc,lp,S.board);
        if (more.length) {
            // FIX 3: update lastMove on each sub-jump so highlight tracks latest hop
            S.lastMove=[S.jumping?S.jumping[0]:tr, S.jumping?S.jumping[1]:tc, tr, tc];
            S.jumping=[tr,tc]; S.sel=[tr,tc]; S.valid=more; S.mustJump=true;
            render(); ui(); return;
        }
    }
    S.jumping=null; S.mustJump=false;
    const cnt=countPieces(p.c);
    if (cnt<=2) {
        if (!m[2]) { S.drawSide===p.c?S.drawCnt++:(S.drawSide=p.c,S.drawCnt=1); }
        else { S.drawSide=null; S.drawCnt=0; }
        if (S.drawCnt>=10) { S.over=true; S.result='Draw (10-move rule)'; render();ui();mlog();return; }
    } else { S.drawSide=null; S.drawCnt=0; }
    S.cur=S.cur==='red'?'black':'red';
    S.mustJump=allCkJumps(S.cur,S.board).length>0;
    if (!hasCkMoves(S.cur,S.board)) {
        S.over=true; S.result=`${S.cur==='red'?'Black':'Red'} wins – no moves`;
    }
    render(); ui(); mlog();
    if (S.mode==='ai'&&!S.over&&S.cur===S.aiColor) schedAI();
}

function countPieces(col) {
    let n=0;
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(S.board[r][c]?.c===col) n++;
    return n;
}

function notation(fr,fc,tr,tc,p,cap,sp) {
    if (S.game==='chess') {
        if (sp==='KS') return 'O-O';
        if (sp==='QS') return 'O-O-O';
        const f='abcdefgh',rk='87654321';
        const sym={king:'K',queen:'Q',rook:'R',bishop:'B',knight:'N',pawn:''}[p.t];
        let n=sym;
        if (cap||sp==='ep'){ if(p.t==='pawn')n+=f[fc]; n+='x'; }
        return n+f[tc]+rk[tr];
    }
    return `${'abcdefgh'[fc]}${8-fr}${cap?'×':'→'}${'abcdefgh'[tc]}${8-tr}`;
}

/* Feature 3: Automated AI Promotion — no modal for AI, instant queen selection */
function showProm(r,c,col,rec) {
    // If it's the AI's turn, auto-promote to queen immediately — no modal, no blocking
    if (S.mode==='ai' && col===S.aiColor) {
        S.board[r][c]={t:'queen',c:col};
        rec.n=notation(rec.fr,rec.fc,r,c,rec.p,rec.cap,rec.sp)+'=Q';
        S.hist.push(rec);
        sndMove();
        finish({3:null,2:!!rec.cap},rec.p,r,c);
        return;
    }
    // Human player → show interactive promotion modal
    const ov=document.createElement('div');
    ov.style='position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:99';
    const dlg=document.createElement('div');
    dlg.style='background:#252529;padding:20px;border-radius:12px;display:flex;gap:12px;flex-direction:column;align-items:center';
    const title=document.createElement('div');
    title.style='color:#f0d9b5;font-weight:700;font-size:1rem;letter-spacing:.5px';
    title.textContent='Promote Pawn';
    dlg.appendChild(title);
    const choices=document.createElement('div');
    choices.style='display:flex;gap:12px';
    ['queen','rook','bishop','knight'].forEach(t=>{
        const b=document.createElement('button');
        b.style='width:64px;height:64px;background:#333;border:2px solid #555;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;transition:.15s';
        b.title = t;
        b.onmouseover=()=>{b.style.borderColor='#7eb44a';b.style.transform='scale(1.08)'};
        b.onmouseout=()=>{b.style.borderColor='#555';b.style.transform='scale(1)'};
        const sp = document.createElement('span');
        sp.className = 'piece ' + col;
        sp.style.cssText = 'font-size:40px;line-height:1';
        sp.textContent = CU[col][t];
        b.appendChild(sp);
        b.onclick=()=>{
            S.board[r][c]={t,c:col}; ov.remove();
            rec.n=notation(rec.fr,rec.fc,r,c,rec.p,rec.cap,rec.sp)+'='+t[0].toUpperCase();
            S.hist.push(rec);
            sndMove();
            finish({3:null,2:!!rec.cap},rec.p,r,c);
        };
        choices.appendChild(b);
    });
    dlg.appendChild(choices);
    ov.appendChild(dlg); document.body.appendChild(ov);
}

/* ═══════════════════════════════════════════════════════
   AI — schedules with difficulty-based delay (2–5s)
   beginner: 2s | intermediate: 2.5-3s | advanced: 3-3.5s
   medium:   3.5-4.5s | hard: 4-5s
═══════════════════════════════════════════════════════ */
function aiDelay() {
    const ranges = {
        beginner:     [2000, 2000],
        intermediate: [2500, 3000],
        advanced:     [3000, 3500],
        medium:       [3500, 4500],
        hard:         [4000, 5000],
    };
    const [lo, hi] = ranges[S.diff] ?? [2000, 3000];
    return lo + Math.random() * (hi - lo);
}

function schedAI() {
    if (S.aiThinking||S.over) return;
    S.aiThinking=true; ui();
    // Compute the best move immediately (non-blocking feel), then wait the delay
    setTimeout(()=>{
        let mv;
        try { mv = S.game==='chess' ? chessAI() : checkersAI(); }
        catch(e) { console.error('AI error',e); S.aiThinking=false; ui(); return; }
        if (!mv) { S.aiThinking=false; ui(); return; }
        setTimeout(()=>{
            if (S.over) { S.aiThinking=false; ui(); return; }
            S.aiThinking=false;
            try { doMove(mv.fr,mv.fc,mv.tr,mv.tc,mv.m); }
            catch(e){ console.error('AI play error',e); ui(); }
        }, aiDelay());
    }, 60);
}

/* ═══════════════════════════════════════════════════════
   CHESS AI
═══════════════════════════════════════════════════════ */
const PVAL={pawn:100,knight:320,bishop:330,rook:500,queen:900,king:20000};

const PST={
pawn:  [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
knight:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
bishop:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
rook:  [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
queen: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
king:  [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
};

function evalChess(bd,aiCol) {
    let score=0;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c]; if(!p) continue;
        const base=PVAL[p.t]||0;
        const pr=p.c==='white'?r:7-r;
        const pst=(PST[p.t]?.[pr]?.[c])||0;
        score += p.c===aiCol ? base+pst : -(base+pst);
    }
    return score;
}

function mvScore(bd,fr,fc,m) {
    if (m[2]) {
        const vic=bd[m[0]][m[1]];
        const att=bd[fr][fc];
        return 10000 + (PVAL[vic?.t]||0) - (PVAL[att?.t]||0)/100;
    }
    return PST[bd[fr][fc]?.t]?.[m[0]]?.[m[1]] || 0;
}

/* ── FIX: Pass ep/cast down through recursion instead of null,null ── */
/* Quiescence search — only examines captures at leaf nodes to avoid horizon effect */
function quiesce(bd, alpha, beta, maxing, aiCol, ep, cast) {
    if (Date.now() > _aiDeadline) return evalChess(bd, aiCol);
    const standPat = evalChess(bd, aiCol);
    if (maxing) {
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (standPat < beta) beta = standPat;
    }
    const col = maxing ? aiCol : (aiCol==='white'?'black':'white');
    const captureMoves = legalMoves(col,bd,ep,cast).filter(({m})=>m[2]);
    if (!captureMoves.length) return standPat;
    if (maxing) {
        let v = standPat;
        for (const {fr,fc,m} of captureMoves) {
            const nb   = simMove(bd,fr,fc,m[0],m[1],m[3]);
            const nEp  = nextEp(bd[fr][fc], fr, m[0], m[1], m[3]);
            const nCst = nextCast(cast, bd, fr, fc, m[0], m[1], bd[fr][fc]);
            v = Math.max(v, quiesce(nb, alpha, beta, false, aiCol, nEp, nCst));
            alpha = Math.max(alpha, v); if (beta<=alpha) break;
        }
        return v;
    } else {
        let v = standPat;
        for (const {fr,fc,m} of captureMoves) {
            const nb   = simMove(bd,fr,fc,m[0],m[1],m[3]);
            const nEp  = nextEp(bd[fr][fc], fr, m[0], m[1], m[3]);
            const nCst = nextCast(cast, bd, fr, fc, m[0], m[1], bd[fr][fc]);
            v = Math.min(v, quiesce(nb, alpha, beta, true, aiCol, nEp, nCst));
            beta = Math.min(beta, v); if (beta<=alpha) break;
        }
        return v;
    }
}

// Hard deadline (ms since epoch) — set before each AI call; search aborts when exceeded
let _aiDeadline = Infinity;

function chessAB(bd, depth, alpha, beta, maxing, aiCol, ep, cast) {
    if (Date.now() > _aiDeadline) return evalChess(bd, aiCol);
    if (depth===0) {
        if (S.diff==='hard') return quiesce(bd, alpha, beta, maxing, aiCol, ep, cast);
        return evalChess(bd,aiCol);
    }
    const col = maxing ? aiCol : (aiCol==='white'?'black':'white');
    const moves = legalMoves(col,bd,ep,cast);
    if (!moves.length) {
        if (isInCheck(col,bd)) return maxing ? -99999 : 99999;
        return 0;
    }
    moves.sort((a,b)=>mvScore(bd,b.fr,b.fc,b.m)-mvScore(bd,a.fr,a.fc,a.m));
    if (maxing) {
        let v=-Infinity;
        for (const {fr,fc,m} of moves) {
            if (Date.now() > _aiDeadline) break;
            const nb   = simMove(bd,fr,fc,m[0],m[1],m[3]);
            const nEp  = nextEp(bd[fr][fc], fr, m[0], m[1], m[3]);
            const nCst = nextCast(cast, bd, fr, fc, m[0], m[1], bd[fr][fc]);
            v=Math.max(v, chessAB(nb,depth-1,alpha,beta,false,aiCol,nEp,nCst));
            alpha=Math.max(alpha,v); if(beta<=alpha) break;
        }
        return v;
    } else {
        let v=Infinity;
        for (const {fr,fc,m} of moves) {
            if (Date.now() > _aiDeadline) break;
            const nb   = simMove(bd,fr,fc,m[0],m[1],m[3]);
            const nEp  = nextEp(bd[fr][fc], fr, m[0], m[1], m[3]);
            const nCst = nextCast(cast, bd, fr, fc, m[0], m[1], bd[fr][fc]);
            v=Math.min(v, chessAB(nb,depth-1,alpha,beta,true,aiCol,nEp,nCst));
            beta=Math.min(beta,v); if(beta<=alpha) break;
        }
        return v;
    }
}

function chessAI() {
    const DIFF_MAP = {
        'beginner':    {depth:2, wobble:true,  budget:800},
        'intermediate':{depth:3, wobble:false, budget:1200},
        'advanced':    {depth:4, wobble:false, budget:1800},
        'medium':      {depth:5, wobble:false, budget:2500},
        'hard':        {depth:6, wobble:false, budget:3000},
    };
    const {depth, wobble, budget} = DIFF_MAP[S.diff] ?? {depth:3, wobble:false, budget:1500};
    _aiDeadline = Date.now() + budget;
    const col=S.aiColor;
    const moves=legalMoves(col,S.board,S.ep,S.cast);
    if (!moves.length) return null;
    if (depth===0) {
        const r=moves[Math.floor(Math.random()*moves.length)];
        return {fr:r.fr,fc:r.fc,tr:r.m[0],tc:r.m[1],m:r.m};
    }
    moves.sort((a,b)=>mvScore(S.board,b.fr,b.fc,b.m)-mvScore(S.board,a.fr,a.fc,a.m));
    const scored = [];
    for (const {fr,fc,m} of moves) {
        if (Date.now() > _aiDeadline) break;
        const nb   = simMove(S.board,fr,fc,m[0],m[1],m[3]);
        const nEp  = nextEp(S.board[fr][fc], fr, m[0], m[1], m[3]);
        const nCst = nextCast(S.cast, S.board, fr, fc, m[0], m[1], S.board[fr][fc]);
        const v=chessAB(nb,depth-1,-Infinity,Infinity,false,col,nEp,nCst);
        scored.push({fr,fc,tr:m[0],tc:m[1],m,v});
    }
    if (!scored.length) {
        const r = moves[0];
        return {fr:r.fr,fc:r.fc,tr:r.m[0],tc:r.m[1],m:r.m};
    }
    scored.sort((a,b)=>b.v-a.v);
    if (wobble && scored.length>1 && Math.random()<0.25) {
        const pick = Math.min(Math.floor(Math.random()*2)+1, scored.length-1);
        return scored[pick];
    }
    return scored[0];
}

/* ═══════════════════════════════════════════════════════
   CHECKERS AI
═══════════════════════════════════════════════════════ */
function simCk(bd,{fr,fc,m}) {
    const b=bd.map(r=>r.map(c=>c?{...c}:null));
    const p=b[fr][fc];
    if (!p) return b;
    const[tr,tc,cap]=m;
    b[tr][tc]=p; b[fr][fc]=null;
    if (cap) { const mr=(fr+tr)/2,mc=(fc+tc)/2; b[mr][mc]=null; }
    // Crown on promotion
    if (p.c==='red'&&tr===0&&p.t==='man') b[tr][tc]={t:'king',c:'red'};
    if (p.c==='black'&&tr===7&&p.t==='man') b[tr][tc]={t:'king',c:'black'};
    return b;
}

function evalCk(bd,aiCol) {
    let score=0;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
        const p=bd[r][c]; if(!p) continue;
        const base=p.t==='king'?300:100;
        const pos=p.t==='man'
            ? (p.c==='red'?(7-r)*6:r*6)
            : ((3.5-Math.abs(r-3.5))+(3.5-Math.abs(c-3.5)))*3;
        score += p.c===aiCol ? base+pos : -(base+pos);
    }
    return score;
}

/* ── FIX: Multi-jump lookahead — if capture leads to more jumps,
          continue evaluating the same player (don't switch turns) ── */
function ckAB(bd, depth, alpha, beta, maxing, aiCol) {
    if (depth===0) return evalCk(bd,aiCol);
    const col = maxing ? aiCol : (aiCol==='red'?'black':'red');
    const jumps = allCkJumps(col,bd);
    const moves = jumps.length ? jumps : allCkMoves(col,bd);
    if (!moves.length) return maxing ? -9999 : 9999;

    if (maxing) {
        let v=-Infinity;
        for (const mv of moves) {
            const nb = simCk(bd, mv);
            // Check if this capture was a promotion (kinging ends multi-jump)
            const wasMan = bd[mv.fr][mv.fc]?.t==='man';
            const kinged = wasMan && nb[mv.m[0]][mv.m[1]]?.t==='king';
            // If capture produces further jumps for same piece AND piece didn't just king
            if (mv.m[2] && !kinged) {
                const furtherJumps = ckJumps(mv.m[0], mv.m[1], nb[mv.m[0]][mv.m[1]], nb);
                if (furtherJumps.length) {
                    // Same player continues — stay maxing, depth-1
                    v=Math.max(v, ckAB(nb,depth-1,alpha,beta,true,aiCol));
                    alpha=Math.max(alpha,v); if(beta<=alpha) break;
                    continue;
                }
            }
            v=Math.max(v, ckAB(nb,depth-1,alpha,beta,false,aiCol));
            alpha=Math.max(alpha,v); if(beta<=alpha) break;
        }
        return v;
    } else {
        let v=Infinity;
        for (const mv of moves) {
            const nb = simCk(bd, mv);
            const wasMan = bd[mv.fr][mv.fc]?.t==='man';
            const kinged = wasMan && nb[mv.m[0]][mv.m[1]]?.t==='king';
            if (mv.m[2] && !kinged) {
                const furtherJumps = ckJumps(mv.m[0], mv.m[1], nb[mv.m[0]][mv.m[1]], nb);
                if (furtherJumps.length) {
                    v=Math.min(v, ckAB(nb,depth-1,alpha,beta,false,aiCol));
                    beta=Math.min(beta,v); if(beta<=alpha) break;
                    continue;
                }
            }
            v=Math.min(v, ckAB(nb,depth-1,alpha,beta,true,aiCol));
            beta=Math.min(beta,v); if(beta<=alpha) break;
        }
        return v;
    }
}

function checkersAI() {
    // FIX 1: Clean difficulty levels — no 'easy', proper depth scaling
    const DIFF_MAP = {
        'beginner':    {depth:1, wobble:true},
        'intermediate':{depth:3, wobble:false},
        'advanced':    {depth:5, wobble:false},
        'medium':      {depth:6, wobble:false},
        'hard':        {depth:8, wobble:false},
    };
    const {depth, wobble} = DIFF_MAP[S.diff] ?? {depth:3, wobble:false};
    const col=S.aiColor;
    const moves=allCkMoves(col,S.board);
    if (!moves.length) return null;
    if (depth===0) {
        const r=moves[Math.floor(Math.random()*moves.length)];
        return {fr:r.fr,fc:r.fc,tr:r.m[0],tc:r.m[1],m:r.m};
    }
    moves.sort((a,b)=>(b.m[2]?1:0)-(a.m[2]?1:0));
    const scored=[];
    for (const mv of moves) {
        const v=ckAB(simCk(S.board,mv),depth-1,-Infinity,Infinity,false,col);
        scored.push({fr:mv.fr,fc:mv.fc,tr:mv.m[0],tc:mv.m[1],m:mv.m,v});
    }
    scored.sort((a,b)=>b.v-a.v);
    // Feature 1: beginner/easy — 25% chance to pick 2nd or 3rd best
    if (wobble && scored.length>1 && Math.random()<0.25) {
        const pick = Math.min(Math.floor(Math.random()*2)+1, scored.length-1);
        return scored[pick];
    }
    return scored[0];
}

/* ═══════════════════════════════════════════════════════
   UNDO
═══════════════════════════════════════════════════════ */
function undo() {
    if (S.over||!S.hist.length||S.aiThinking) return;
    const n = S.mode==='ai' ? Math.min(2,S.hist.length) : 1;
    for (let i=0;i<n;i++) {
        const h=S.hist.pop(); if(!h) break;
        S.board[h.fr][h.fc]=h.p;
        S.board[h.tr][h.tc]=h.cap||null;
        if (h.sp==='KS'){const row=h.fr;S.board[row][7]=S.board[row][5];S.board[row][5]=null;}
        if (h.sp==='QS'){const row=h.fr;S.board[row][0]=S.board[row][3];S.board[row][3]=null;}
        if (h.cap&&S.game==='checkers') {
            const mr=(h.fr+h.tr)/2,mc=(h.fc+h.tc)/2;
            S.board[mr][mc]=h.cap;
            S.board[h.tr][h.tc]=null;
        }
        S.ep=h.ep; S.cast={...h.cast}; S.cur=h.player;
        if (S.game==='chess') {
            S.halfMoveClock=h.halfMoveClock||0;
            if (S.positionHashes.length) S.positionHashes.pop();
        }
    }
    S.lastMove=S.hist.length?[S.hist[S.hist.length-1].fr,S.hist[S.hist.length-1].fc,S.hist[S.hist.length-1].tr,S.hist[S.hist.length-1].tc]:null;
    Object.assign(S,{sel:null,valid:[],over:false,result:null,inCheck:null,jumping:null,drawCnt:0,drawSide:null,mustJump:false});
    if (S.game==='chess') S.inCheck=isInCheck(S.cur,S.board)?S.cur:null;
    else S.mustJump=allCkJumps(S.cur,S.board).length>0;
    render(); ui(); mlog();
}

/* ═══════════════════════════════════════════════════════
   BUTTONS & UI SETUP
═══════════════════════════════════════════════════════ */
function updateAvatars() {
    const isChess = S.game === 'chess';
    const isAI = S.mode === 'ai';
    const avatarLeft  = $('avatarLeft');
    const avatarRight = $('avatarRight');
    const nameLeft    = $('nameLeft');
    const nameRight   = $('nameRight');
    if (isChess) {
        avatarLeft.textContent  = '♙';
        avatarRight.textContent = isAI ? '🤖' : '♟';
    } else {
        avatarLeft.textContent  = '🔴';
        avatarRight.textContent = isAI ? '🤖' : '⚫';
    }
    avatarLeft.className  = 'avatar-img white-player';
    avatarRight.className = isAI ? 'avatar-img ai-player' : 'avatar-img black-player';
    nameLeft.textContent  = isChess ? 'White' : 'Red';
    nameRight.textContent = isAI ? 'AI' : (isChess ? 'Black' : 'Black');
    // Feature 2: update score bar labels
    const lbTop = $('sbLabelTop');
    const lbBot = $('sbLabelBot');
    if (lbTop) lbTop.textContent = isAI ? 'AI (Black)' : (isChess?'Black':'Black');
    if (lbBot) lbBot.textContent = isChess ? 'Player (White)' : 'Player (Red)';
    // Feature 2: update mlog column headers
    const hdr1=$('mlogHdr1'), hdr2=$('mlogHdr2');
    if(hdr1) hdr1.textContent = isChess?'White':'Red';
    if(hdr2) hdr2.textContent = isAI ? 'AI (Black)' : 'Black';
}

function resetUI() {
    $('bChess').classList.toggle('active',S.game==='chess');
    $('bCheck').classList.toggle('active',S.game==='checkers');
    $('b2p').classList.toggle('active',S.mode==='2player');
    $('bAI').classList.toggle('active',S.mode==='ai');
    diffBox.style.display=S.mode==='ai'?'block':'none';
    $('gameTitle').textContent = S.game==='chess' ? '♟️ Chess' : '🔴 Checkers';
    updateAvatars();
    setup();
}

$('bChess').onclick  = ()=>{ S.game='chess';    resetUI(); };
$('bCheck').onclick  = ()=>{ S.game='checkers'; resetUI(); };
$('b2p').onclick     = ()=>{ S.mode='2player';  diffBox.style.display='none'; resetUI(); };
$('bAI').onclick     = ()=>{ S.mode='ai'; S.aiColor='black'; diffBox.style.display='block'; resetUI(); };
$('diffSel').onchange= e=>{ S.diff=e.target.value; };
$('bNew').onclick    = ()=>resetUI();
$('bUndo').onclick   = ()=>undo();
$('bFlip').onclick   = ()=>{
    S.flipped = !S.flipped;
    coords();
    render();
};

window.addEventListener('load',()=>resetUI());
})();