"""Replace an entire triplet overlapped by a known native diagnostic capture."""
import json
from pathlib import Path
p=Path('output/next-optimizations-safari-2026-10-24');name='ui-cache'
a=json.loads((p/f'performance-{name}.json').read_text());b=json.loads((p/f'performance-{name}-replay.json').read_text());assert len(a['trials'])==36 and len(b['trials'])==3 and not a['errors']and not b['errors']
key=lambda t:(t['pair'],t['language'],t['floor'],t['variant']);replacements={key(t):t for t in b['trials']};assert all(k[:3]==(2,'ja','1F')for k in replacements)
excluded=[t for t in a['trials']if key(t)in replacements];assert len(excluded)==3
(p/'excluded-ui-cache-diagnostic-triplet.json').write_text(json.dumps({'reason':'Native diagnostic screenshot was taken during pair2 ja1F; replace all three variants, not only the slow trial','trials':excluded},ensure_ascii=False,indent=2))
a['trials']=[replacements.get(key(t),t)for t in a['trials']];a['replacementNote']='Pair2 ja1F replaced as a whole with replay after native diagnostic capture; original36 + replay3 retained.'
(p/f'performance-{name}-accepted.json').write_text(json.dumps(a,ensure_ascii=False,indent=2));print('accepted 36 trials, one complete diagnostic-overlap triplet replaced')
