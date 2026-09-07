# Theme

## Compact token summary

The current UI has two related but inconsistent CSS Module palettes. Both are warm, restrained, and suitable as structural anchors; W5-01 will normalize them to the approved cream/ink/pistachio/berry contract.

- Background: `#f7f4ef` or `#f7f6f0`
- Surface: `#fffdf9` or `#ffffff`
- Primary ink/green: `#243831`, `#193e34`, `#254d3b`
- Muted text: `#58675f`, `#58695e`, `#53695b`
- Borders: `#ddd8cf`, `#d9dfd5`, `#91a598`
- Safe/success surface: `#e8f0e2`, `#e8f0e9`
- Warning surface: `#fff3df` with `#ead5af`
- Error: `#9d2424`
- Focus: `#789e88`, `#b38529`
- Body font: Arial/Helvetica/system sans
- Current heading font: Georgia serif
- Spacing: mostly 8 px-derived values; 16, 18, 20, 24, 28, 32, 36, 40 px
- Radius: 6, 8, 9, 12, and 20 px
- Shadow: `0 12px 40px #2438310c`
- Responsive breakpoints: 460 px and 800 px
- Interactive target height: 46–48 px

No global CSS, Tailwind configuration, theme provider, or shared token file exists.

## Raw source: login/auth.module.css

```css
.shell{min-height:100dvh;display:grid;place-items:center;background:#f7f4ef;color:#243831;font-family:Arial,sans-serif;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);background:#fffdf9;border:1px solid #ddd8cf;border-radius:20px;padding:36px;box-shadow:0 12px 40px #2438310c;box-sizing:border-box}.brand{letter-spacing:.13em;font-size:12px;font-weight:700;color:#64766d;text-transform:uppercase;margin:0 0 26px}.title{font-family:Georgia,serif;font-size:32px;line-height:1.2;margin:0 0 12px}.hint{line-height:1.6;color:#58675f;font-size:14px;margin-bottom:24px}.form{display:grid;gap:18px}.label{font-size:14px;font-weight:600;display:grid;gap:8px}.input{width:100%;box-sizing:border-box;min-height:48px;border:1px solid #a5b0a8;border-radius:9px;padding:12px;font:inherit;background:#fff}.input:focus{outline:3px solid #b8d5c7;outline-offset:2px}.button{min-height:48px;border:0;border-radius:9px;background:#254d3b;color:#fff;padding:13px 16px;font:inherit;font-weight:600;cursor:pointer}.button:disabled{opacity:.6;cursor:wait}.button:focus-visible,.link:focus-visible{outline:3px solid #789e88;outline-offset:3px}.alert{color:#9d2424;line-height:1.5;font-size:14px;margin:0}.link{display:inline-block;color:#254d3b;margin-top:20px;font-size:14px;min-height:32px}.badge{display:inline-block;padding:8px 12px;background:#e8f0e9;border-radius:8px;margin-bottom:18px;font-size:14px}@media(max-width:460px){.card{padding:26px}.shell{padding:16px}.title{font-size:28px}}
```

## Raw source: attendance/review.module.css

```css
.shell{font-family:Arial,Helvetica,sans-serif;max-width:1200px;margin:0 auto;padding:40px 28px;color:#193e34;background:#f7f6f0;min-height:100vh;box-sizing:border-box}.header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:32px}.header h1{font-family:Georgia,serif;font-size:38px;font-weight:400;margin:14px 0}.header p{line-height:1.5}.brand{font-size:11px;letter-spacing:2px;font-weight:700}.shell a{color:#285844;min-height:44px;display:inline-flex;align-items:center}.filters{display:flex;align-items:end;gap:16px;flex-wrap:wrap;padding:24px;background:#fff;border:1px solid #d9dfd5;border-radius:12px}.shell label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}.shell input,.shell select,.shell textarea{min-height:46px;padding:10px 12px;border:1px solid #91a598;border-radius:6px;font:inherit;color:inherit;box-sizing:border-box;background:#fff}.shell textarea{width:100%;min-height:86px;margin-bottom:15px}.shell button{min-height:46px;padding:12px 18px;background:#193e34;color:#fff;border:1px solid #193e34;border-radius:6px;font-size:14px;cursor:pointer}.shell button:disabled{opacity:.45;cursor:default}.shell :focus-visible{outline:3px solid #b38529;outline-offset:3px}.badge{padding:12px 0;font-size:12px;color:#53695b}.notice{min-height:25px;color:#684516;font-size:14px}.card,.blockers,.success{padding:24px;border:1px solid #d9dfd5;border-radius:12px;background:#fff;margin:20px 0}.blockers{background:#fff3df;border-color:#ead5af}.success{background:#e8f0e2}.shell h2{font-size:18px;margin:0 0 14px}.shell p{font-size:14px;line-height:1.6}.muted{color:#58695e;font-size:12px!important}.columns{display:grid;grid-template-columns:2fr 1fr;gap:20px}.columns .card{margin:0}.tableWrap{overflow:auto}.shell table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.shell th,.shell td{padding:13px 8px;border-bottom:1px solid #e0e5dc}.shell th{font-size:11px;text-transform:uppercase;color:#596c5f}.check{flex-direction:row!important;align-items:center;min-height:44px}.check input{min-width:44px;width:44px;height:44px}.segment{border:1px solid #d9dfd5;border-radius:8px;padding:20px;margin:16px 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}.segment legend{font-size:12px;padding:0 8px}.secondary{background:#fff!important;color:#193e34!important;margin-bottom:20px}.actions{display:flex;gap:18px;align-items:center}.shell code{display:block;overflow-wrap:anywhere;font-size:13px}.shell summary{min-height:44px;cursor:pointer;font-size:13px}.shell fieldset:disabled{opacity:.75}@media(max-width:800px){.shell{padding:24px 16px}.header{align-items:flex-start}.header h1{font-size:32px}.columns{grid-template-columns:1fr}.segment{grid-template-columns:1fr}.filters{align-items:stretch}.filters label{flex:1;min-width:150px}.card,.blockers,.success{padding:18px}.header p{font-size:13px}}
```
