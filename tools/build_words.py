import json, re, sys, os
D = sys.argv[1]; out = sys.argv[2]
wn = D + '/wn/package/dict/'
POS = {'noun':'n','verb':'v','adj':'a','adv':'r'}
POSNAME = {'n':'noun','v':'verb','a':'adjective','s':'adjective','r':'adverb'}
BAD = re.compile(r'\b(offensive|obscene|vulgar|slur|derogatory|disparaging|sexual intercourse|genital|penis|vagina|feces|excrement|urinat|masturbat|prostitut|racial|ethnic)\b', re.I)
# load data files: offset -> (lemmas, gloss, pos)
data = {}
for name, p in POS.items():
    for line in open(wn + 'data.' + name, encoding='utf8'):
        if line.startswith('  '): continue
        head, _, gloss = line.partition(' | ')
        f = head.split()
        off, ss = f[0], f[2]
        n = int(f[3], 16)
        lemmas = [re.sub(r'\(.*\)$', '', f[4 + 2*i]) for i in range(n)]
        data[(p, off)] = (lemmas, gloss.strip(), ss)
# index: word -> list of (p, offsets in sense order)
senses = {}
for name, p in POS.items():
    for line in open(wn + 'index.' + name, encoding='utf8'):
        if line.startswith('  '): continue
        f = line.split()
        lemma = f[0]; synset_cnt = int(f[2]); pcnt = int(f[3])
        offs = f[4 + pcnt + 2:]
        senses.setdefault(lemma, []).append((p, offs[:synset_cnt]))
def defs(word):
    res = []; bad = False
    for p, offs in senses.get(word, []):
        items = []
        for o in offs:
            lemmas, gloss, ss = data[(p, o)]
            if word not in lemmas: continue  # only capitalized/proper forms
            if BAD.search(gloss): bad = True
            parts = [x.strip() for x in gloss.split(';')]
            d = [x for x in parts if not x.startswith('"')]
            ex = [x.strip('" ') for x in parts if x.startswith('"')]
            if not d: continue
            item = {'d': '; '.join(d)}
            if ex: item['e'] = ex[0]
            items.append(item)
        if items:
            res.append({'p': POSNAME[p], 'senses': items[:2]})
    return res, bad
alpha = set(w.strip() for w in open(D + '/words_alpha.txt'))
freq = [w.strip() for w in open(D + '/20k.txt')]
blockfile = os.path.join(os.path.dirname(__file__), 'blocklist.txt')
block = set(w.strip() for w in open(blockfile) if w.strip()) if os.path.exists(blockfile) else set()
answers = {5: [], 6: [], 7: []}; meanings = {}
for w in freq:
    L = len(w)
    if L not in answers or not w.isalpha() or not w.isascii() or w in block: continue
    if w in meanings: continue
    if w.endswith('s') and (w[:-1] in senses or w[:-2] in senses) and not w.endswith('ss'): continue
    if w.endswith('ed') and (w[:-1] in senses or w[:-2] in senses): continue
    d, bad = defs(w)
    if not d or bad: continue
    answers[L].append(w); meanings[w] = d
guesses = {L: sorted(set(w for w in alpha if len(w) == L) | set(answers[L])) for L in answers}
os.makedirs(out, exist_ok=True)
for L in answers:
    json.dump({'answers': answers[L], 'meanings': {w: meanings[w] for w in answers[L]}}, open(f'{out}/answers-{L}.json', 'w'), separators=(',', ':'))
    open(f'{out}/guesses-{L}.txt', 'w').write('\n'.join(guesses[L]))
    print(L, len(answers[L]), len(guesses[L]))
