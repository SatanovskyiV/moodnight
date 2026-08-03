// MoodNight — main app

const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "gold",
  "ornamentDensity": "rich",
  "typePair": "ornate",
  "feedDensity": "spacious",
  "texture": true,
  "embers": true
}/*EDITMODE-END*/;

const ACCENTS = [
  { id: "gold", label: "Золото" },
  { id: "crimson", label: "Кров" },
  { id: "moss", label: "Мох" },
  { id: "ivory", label: "Слонова кістка" }
];

const TYPE_PAIRS = [
  { id: "ornate", label: "Орнаментальний" },
  { id: "blackletter", label: "Готичний" },
  { id: "restrained", label: "Стриманий" }
];

function Embers({ count = 28 }) {
  const embers = React.useMemo(() => (
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      duration: 8 + Math.random() * 14,
      delay: Math.random() * 14,
      size: 1 + Math.random() * 2.5,
      drift: (Math.random() - 0.5) * 60
    }))
  ), [count]);

  return (
    <div className="embers" aria-hidden="true">
      {embers.map(e => (
        <div key={e.id} className="ember" style={{
          left: `${e.left}%`,
          width: `${e.size}px`,
          height: `${e.size}px`,
          animationDuration: `${e.duration}s`,
          animationDelay: `${e.delay}s`,
          ['--drift']: `${e.drift}px`
        }} />
      ))}
    </div>
  );
}

function Divider({ glyph }) {
  return (
    <div className="divider">
      <div className="line" />
      <span className="glyph"><Quatrefoil size={18} /></span>
      <div className="line" />
    </div>
  );
}

function TopNav({ onSignIn }) {
  return (
    <nav className="topnav">
      <a href="#" className="brand">
        <span className="sigil"><Sigil size={26} /></span>
        <span>MoodNight</span>
      </a>
      <div className="links">
        <a href="#feed">Стрічка</a>
        <a href="#authors">Автори</a>
        <a href="#collections">Збірки</a>
        <a href="#about">Про нас</a>
        <button className="btn btn-ghost" onClick={onSignIn} style={{padding: '0.6rem 1.4rem', fontSize: '0.72rem'}}>Увійти</button>
      </div>
    </nav>
  );
}

function Hero({ onWrite, onExplore }) {
  return (
    <header className="hero" data-screen-label="01 Hero">
      <div className="hero-bg">
        <div className="hero-bg-placeholder" />
        <HeroSilhouette />
      </div>
      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="dot" />
          <span>Слово, що не згасає</span>
          <span className="dot" />
        </div>
        <h1 className="hero-title">
          Mood<span className="accent">·</span>Night
        </h1>
        <p className="hero-tagline">
          Вільний дім для української поезії — там, де темрява зустрічає світло свічі,
          а кожне слово стає вогнем у попелі ночі.
        </p>
        <div className="hero-cta">
          <button className="btn" onClick={onWrite}>Опублікувати вірш</button>
          <button className="btn btn-ghost" onClick={onExplore}>Читати стрічку</button>
        </div>
      </div>
      <div className="scroll-indicator">
        <span>Спустись у морок</span>
        <span className="arrow">▼</span>
      </div>
    </header>
  );
}

function PoemCard({ poem, expanded, onToggle, onReact, reactions }) {
  const lines = poem.body.split("\n");
  const visibleLines = expanded ? lines : lines.slice(0, 4);
  const truncated = !expanded && lines.length > 4;

  return (
    <article className="poem">
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />

      <div className="poem-meta">
        <div className="poem-author">
          <div className="avatar">{poem.initials}</div>
          <div>
            <div className="name">{poem.author}</div>
            <div className="role">{poem.role}</div>
          </div>
        </div>
        <span className="poem-tag">
          <Rune size={12} glyph="rune1" />
          {poem.tag}
        </span>
      </div>

      <h3 className="poem-title">{poem.title}</h3>
      <p className="poem-subtitle">{poem.subtitle}</p>

      <div className={`poem-body ${expanded || lines.length <= 6 ? 'dropcap' : ''}`}>
        {visibleLines.join("\n")}
        {truncated && <span style={{color: 'var(--parchment-faint)'}}>{"\n…"}</span>}
      </div>

      <div className="poem-foot">
        <div className="poem-stats">
          <button className="poem-stat" onClick={() => onReact(poem.id, 'kindle')}>
            <span className="glyph"><Rune size={14} glyph="kindle" /></span>
            <span>Запалити · {(reactions[poem.id]?.kindles ?? poem.kindles)}</span>
          </button>
          <button className="poem-stat" onClick={() => onReact(poem.id, 'lament')}>
            <span className="glyph"><Rune size={14} glyph="lament" /></span>
            <span>Журитись · {(reactions[poem.id]?.laments ?? poem.laments)}</span>
          </button>
          <span className="poem-stat" style={{cursor: 'default'}}>
            <span className="glyph"><Rune size={14} glyph="eye" /></span>
            <span>{poem.reads.toLocaleString('uk')} читань</span>
          </span>
        </div>
        <button className="poem-readmore" onClick={onToggle}>
          {expanded ? "Згорнути" : "Читати повністю"}
          <span>{expanded ? "▲" : "▶"}</span>
        </button>
      </div>
    </article>
  );
}

function FeaturedFeed({ poems }) {
  const [expanded, setExpanded] = useState({});
  const [reactions, setReactions] = useState({});

  const toggle = (id) => setExpanded(s => ({ ...s, [id]: !s[id] }));
  const react = (id, kind) => {
    setReactions(s => {
      const cur = s[id] || { kindles: poems.find(p => p.id === id).kindles, laments: poems.find(p => p.id === id).laments };
      return {
        ...s,
        [id]: {
          ...cur,
          [kind === 'kindle' ? 'kindles' : 'laments']: cur[kind === 'kindle' ? 'kindles' : 'laments'] + 1
        }
      };
    });
  };

  return (
    <section className="section" id="feed" data-screen-label="02 Featured Feed">
      <div className="container-narrow">
        <div className="section-header">
          <div className="section-eyebrow">
            <FlourishLeft width={50} height={10} /> Обрані строфи <FlourishRight width={50} height={10} />
          </div>
          <h2 className="section-title">Вогні нічних читань</h2>
          <p className="section-subtitle">
            Голоси, що пробились крізь морок цього тижня. Запали свічу там, де знайшов відлуння.
          </p>
        </div>

        <Divider />

        <div className="poems">
          {poems.map(p => (
            <PoemCard
              key={p.id}
              poem={p}
              expanded={!!expanded[p.id]}
              onToggle={() => toggle(p.id)}
              onReact={react}
              reactions={reactions}
            />
          ))}
        </div>

        <div style={{textAlign: 'center', marginTop: '4rem'}}>
          <button className="btn btn-ghost">Переглянути всю стрічку →</button>
        </div>
      </div>
    </section>
  );
}

function AuthSection({ mode, setMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  return (
    <section className="auth-section" id="join" data-screen-label="03 Auth">
      <div className="container">
        <div className="auth-card">
          <span className="seal"><Seal size={64} /></span>
          <h2>{mode === 'signin' ? 'Повернення до вогнища' : 'Стати співцем'}</h2>
          <p>
            {mode === 'signin'
              ? 'Назви себе — і свічі впізнають твоє ім’я.'
              : 'Залиш своє ім’я в книзі тіней, і твоє слово стане частиною ночі.'}
          </p>

          <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
            {mode === 'signup' && (
              <div className="input-wrap">
                <label>Поетичне ім’я</label>
                <input className="input" placeholder="напр., Орися Вечірня" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div className="input-wrap">
              <label>Електронна скриня</label>
              <input className="input" type="email" placeholder="ім’я@домен.ua" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="input-wrap">
              <label>Таємне слово</label>
              <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn" style={{marginTop: '0.8rem'}}>
              {mode === 'signin' ? 'Увійти у ніч' : 'Запалити свою свічу'}
            </button>
          </form>

          <div className="auth-divider">
            <span>або</span>
          </div>

          <button className="btn btn-ghost" style={{width: '100%'}}>
            <Rune size={14} glyph="rune2" /> Продовжити через Google
          </button>

          <p className="auth-alt">
            {mode === 'signin' ? 'Уперше тут?' : 'Вже маєш ім’я?'}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'signin' ? 'signup' : 'signin'); }}>
              {mode === 'signin' ? 'Створити свій голос' : 'Увійти'}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer data-screen-label="04 Footer">
      <Divider />
      <div className="brand">MoodNight</div>
      <p className="tagline">Слово горить — отже, ми ще тут.</p>
      <div className="legal">
        <a href="#">Угода</a> · <a href="#">Приватність</a> · <a href="#">Кодекс автора</a> · <a href="#">Зв’язок</a>
        <div style={{marginTop: '1.2rem', opacity: 0.6}}>© 2026 MoodNight · Зроблено з попелу й світла</div>
      </div>
    </footer>
  );
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [authMode, setAuthMode] = useState('signup');
  const authRef = useRef(null);
  const feedRef = useRef(null);

  // Apply tweaks to root
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = tweaks.accent;
    root.dataset.typePair = tweaks.typePair;
    root.dataset.density = tweaks.feedDensity;
    root.style.setProperty('--ornament-density',
      tweaks.ornamentDensity === 'rich' ? 1 :
      tweaks.ornamentDensity === 'subtle' ? 0.4 : 0);
    root.style.setProperty('--texture-opacity', tweaks.texture ? 0.06 : 0);
  }, [tweaks]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop - 40, behavior: 'smooth' });
  };

  return (
    <>
      {tweaks.embers && <Embers count={32} />}
      <TopNav onSignIn={() => { setAuthMode('signin'); scrollTo('join'); }} />
      <Hero
        onWrite={() => { setAuthMode('signup'); scrollTo('join'); }}
        onExplore={() => scrollTo('feed')}
      />
      <FeaturedFeed poems={POEMS} />
      <AuthSection mode={authMode} setMode={setAuthMode} />
      <Footer />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Палітра">
          <TweakRadio
            label="Акцентний колір"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={ACCENTS.map(a => ({ value: a.id, label: a.label }))}
          />
        </TweakSection>

        <TweakSection label="Типографіка">
          <TweakSelect
            label="Шрифтова пара"
            value={tweaks.typePair}
            onChange={v => setTweak('typePair', v)}
            options={TYPE_PAIRS.map(t => ({ value: t.id, label: t.label }))}
          />
        </TweakSection>

        <TweakSection label="Орнамент">
          <TweakRadio
            label="Щільність декору"
            value={tweaks.ornamentDensity}
            onChange={v => setTweak('ornamentDensity', v)}
            options={[
              { value: "rich", label: "Багатий" },
              { value: "subtle", label: "Тонкий" },
              { value: "off", label: "Без" }
            ]}
          />
          <TweakToggle
            label="Текстура пергаменту"
            value={tweaks.texture}
            onChange={v => setTweak('texture', v)}
          />
          <TweakToggle
            label="Вогники-іскри"
            value={tweaks.embers}
            onChange={v => setTweak('embers', v)}
          />
        </TweakSection>

        <TweakSection label="Стрічка">
          <TweakRadio
            label="Щільність"
            value={tweaks.feedDensity}
            onChange={v => setTweak('feedDensity', v)}
            options={[
              { value: "spacious", label: "Просторо" },
              { value: "comfortable", label: "Щільніше" }
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
