from pathlib import Path
import json
import os
os.environ.setdefault("MPLCONFIGDIR", "/tmp/oic-timing-mplconfig")
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=Path('output/zoom-timing-safari-2026-10-21');s=json.loads((out/'timing-summary.json').read_text())
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
fig,axes=plt.subplots(1,2,figsize=(12,5),sharey=True)
styles=[('every-2','1/2','#3265ae'),('every-3','1/3','#288355'),('baseline','Dev 1/4','#bc3344'),('every-5','1/5','#8e58ad')]
for ax,phase,title in zip(axes,['zoomIn','zoomOut'],['Zoom in','Zoom out']):
 for variant,label,color in styles:ax.plot(range(1,25),s['originalMedianFrameMsByStep'][variant][phase],label=label,color=color,lw=2.6 if variant=='baseline' else 1.6,marker='o',ms=3)
 ax.axhline(140,color='#666',ls='--',lw=1,label='140 ms settle timer' if phase=='zoomIn' else '_nolegend_')
 ax.set(xlabel='Input step',title=title,xlim=(1,24),ylim=(0,285));ax.set_xticks([1,4,8,12,16,20,24]);ax.grid(axis='y',alpha=.2)
axes[0].set_ylabel('rAF interval (ms), median')
axes[1].axvspan(10.6,13.4,color='#bc3344',alpha=.08)
axes[1].annotate('1/4: 260.5 ms\nat step 11',xy=(11,260.5),xytext=(14,238),arrowprops={'arrowstyle':'->','color':'#bc3344'},color='#9b2737')
fig.suptitle('1/4 slowdown is concentrated in a specific zoom-out range',fontsize=15,y=.98)
fig.legend(*axes[0].get_legend_handles_labels(),loc='lower center',ncol=5,frameon=False,bbox_to_anchor=(.5,.06))
fig.text(.5,.02,'Original ja 1F data: 4 trials x 3 cycles per condition | Safari 27.0.1 | 960 x 800 CSS px | DPR 1',ha='center',fontsize=9,color='#555')
fig.subplots_adjust(top=.85,bottom=.25,wspace=.15)
fig.savefig(out/'zoom-frame-times.png',dpi=160)
fig.savefig(out/'zoom-frame-times.svg')
print('Saved original-data chart; matplotlib',matplotlib.__version__)
