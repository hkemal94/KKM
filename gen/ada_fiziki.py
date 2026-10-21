# Adanın fiziki zemin görseli (public/ada-fiziki.webp).
# Yükselti verisinden (src/data/duzadaDem.ts) kumsal, çayır, maki, çam, kaya
# ve sığ su renkleri üretir. Kullanım (depo kökünde):
#   python gen/ada_fiziki.py public/ada-fiziki.webp 4 3468
#   (4 = yükselti verisinin iç büyütme katı, 3468 = çıktının eni, piksel)
import re,base64,io,sys
import numpy as np
from PIL import Image, ImageFilter
s=open('src/data/duzadaDem.ts').read()
i=s.index('export const DEM_PNG'); j=s.index("';\n",i)+1
parca=''.join(re.findall(r"'([^']*)'", s[i:j])).replace('data:image/png;base64,','')
im=np.array(Image.open(io.BytesIO(base64.b64decode(parca))).convert('RGB')).astype(float)
z=(im[:,:,0]*256+im[:,:,1]+im[:,:,2]/256)-32768
KAT=int(sys.argv[2]) if len(sys.argv)>2 else 1
if KAT>1:
    z=np.array(Image.fromarray(z.astype('float32')).resize((z.shape[1]*KAT,z.shape[0]*KAT),Image.BICUBIC))
H,W=z.shape; print(z.shape, round(z.min()), round(z.max()))
# yalnız görünüm için doku: çok ölçekli gürültü (veri değişmez)
rng0=np.random.default_rng(7)
def gurultu(olcek, genlik):
    k=rng0.random((H//olcek+2, W//olcek+2))
    g=np.array(Image.fromarray((k*255).astype('uint8')).resize((W,H), Image.BICUBIC)).astype(float)/255-0.5
    return g*genlik
kara0=z>0
zz=z+np.where(kara0, gurultu(40*KAT,90)*np.clip(z/200,0.2,1)+gurultu(12*KAT,28)+gurultu(4*KAT,8), 0)
gy,gx=np.gradient(zz,20.0/KAT)
slope=np.arctan(np.hypot(gx,gy)*1.6); aspect=np.arctan2(-gx,gy)
az=np.radians(315); alt=np.radians(42)
hs=np.clip(np.sin(alt)*np.cos(slope)+np.cos(alt)*np.sin(slope)*np.cos(az-aspect),0,1)
c=lambda h: np.array([int(h[k:k+2],16) for k in (1,3,5)],float)
def lerp(a,b,t): return a+(b-a)*np.clip(t,0,1)[...,None]
# kıyıya uzaklık: kara maskesinin bulanıklığı
yakin=np.array(Image.fromarray((kara0*255).astype('uint8')).filter(ImageFilter.GaussianBlur(28*KAT))).astype(float)/255
yakin2=np.array(Image.fromarray((kara0*255).astype('uint8')).filter(ImageFilter.GaussianBlur(7*KAT))).astype(float)/255
deniz=lerp(c('#1C4E8C'),c('#2F86B5'),yakin*2.2)
deniz=lerp(deniz,c('#7FD6D2'),yakin2*2.4)
t=np.clip(zz,0,None)
kiyi=yakin2<0.93
bitki=gurultu(30*KAT,1.0)+gurultu(9*KAT,0.6)          # bitki örtüsü lekeleri
tt=t+bitki*120
land=lerp(c('#CBC48E'),c('#A9B06C'),tt/140)                 # kuru çayır
land=lerp(land,c('#7E9656'),(tt-140)/200)                   # maki, zeytinlik
land=lerp(land,c('#57764A'),(tt-330)/160)                   # çam ormanı
land=lerp(land,c('#A39982'),(tt-560)/120)                   # kaya
land=lerp(land,c('#D9D1BF'),(tt-680)/80)                    # zirve
kum=((t<7)|((t<25)&kiyi))
# Plajlar yaşam alanlarına uzar (8 Ekim, Kemal: "özellikle İskele
# Mahallesi'ne"): İskele kıyısında, dik olmayan yerde ~22 m'lik kum
# şeridi; yükseltiden bağımsız (gen/duzada.py PLAJ_BANDI ile aynı yer). Mahalle sınırı haritanın kendi verisinden.
import json as _json
from scipy.ndimage import distance_transform_edt
from PIL import ImageDraw
_g=open('src/data/duzadaGeo.ts').read()
_i=_g.index('JSON.parse("')+12; _j=_g.index('")',_i)
_geo=_json.loads(_json.loads('"'+_g[_i:_j]+'"'))
_d=open('src/data/duzadaDem.ts').read()
_k=_d.index('DEM_SINIR'); _sinir=[float(v) for v in re.findall(r'-?\d+\.?\d*', _d[_d.index('= [',_k):_d.index('];',_k)])]
_w0,_s0,_e0,_n0=_sinir
_maske=Image.new('L',(W,H),0); _ciz=ImageDraw.Draw(_maske)
for _f in _geo['features']:
    _p=_f['properties']
    if _p.get('katman')=='mahalle' and _p.get('id') in ('yer_iskele',) and _f['geometry']['type']=='Polygon':
        _ciz.polygon([((x-_w0)/(_e0-_w0)*W,(_n0-y)/(_n0-_s0)*H) for x,y in _f['geometry']['coordinates'][0]], fill=255)
_yasam=np.array(_maske.filter(ImageFilter.MaxFilter(9)))>0
# Liman kumsalı (21 Ekim): üretecin yazdığı `zemin_liman_kum*` çokgenleri
# (rıhtım önü bunların dışında kalır, orası taş). Mahalle maskesi değil, doğrudan çokgen.
_mk2=Image.new('L',(W,H),0); _ciz2=ImageDraw.Draw(_mk2)
for _f in _geo['features']:
    _p=_f['properties']
    if _p.get('katman')=='zemin' and str(_p.get('id','')).startswith('zemin_liman_kum') and _f['geometry']['type']=='Polygon':
        _ciz2.polygon([((x-_w0)/(_e0-_w0)*W,(_n0-y)/(_n0-_s0)*H) for x,y in _f['geometry']['coordinates'][0]], fill=255)
_liman_kum=np.array(_mk2)>0
_kiyidan=distance_transform_edt(kara0)*(20.0/KAT)          # metre
kum=kum|(_yasam&kara0&(_kiyidan<22)&(slope<0.55))|(_liman_kum&kara0&(slope<0.55))
land=np.where(kum[...,None], c('#EFDFAE'), land)
shade=0.5+0.68*hs
rgb=np.where((z>0)[...,None], land*shade[...,None], deniz)
kara=(z>0)
km=Image.fromarray((kara*255).astype('uint8')).filter(ImageFilter.MaxFilter(3 if KAT==1 else 5))
kopuk=(np.array(km)>0)&~kara
rgb[kopuk]=rgb[kopuk]*0.4+np.array([245,248,245])*0.6
rng=np.random.default_rng(3)
nokta=(rng.random((H,W))<0.035)&(t>15)&(t<260)&(slope<0.5)
rgb[nokta]=rgb[nokta]*0.72
out=Image.fromarray(np.clip(rgb,0,255).astype('uint8'))
# Çıktı eni: ilk sürüm 2312 px'ti; 30 Eylül'de yakından
# bulanık dendi, 1.5 katına çıktı. Daha büyüğü telefonda belleği zorlar.
EN=int(sys.argv[3]) if len(sys.argv)>3 else W//2
out.resize((EN,round(H*EN/W)),Image.LANCZOS).save(sys.argv[1], quality=84)
