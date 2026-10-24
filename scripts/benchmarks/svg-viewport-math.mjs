export function mapVisibleRect({x,y,width,height,viewportWidth,viewportHeight},box,buffer=64){
 if(!(width>0&&height>0&&viewportWidth>0&&viewportHeight>0))return null;
 return {left:box.x+(-x-buffer)*box.width/width,top:box.y+(-y-buffer)*box.height/height,
 right:box.x+(viewportWidth-x+buffer)*box.width/width,bottom:box.y+(viewportHeight-y+buffer)*box.height/height};
}
export function transformBounds(box,m,pad=8){
 const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
 return {left:Math.min(...points.map(p=>p.x))-pad,right:Math.max(...points.map(p=>p.x))+pad,top:Math.min(...points.map(p=>p.y))-pad,bottom:Math.max(...points.map(p=>p.y))+pad};
}
export const overlaps=(a,b)=>a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;
