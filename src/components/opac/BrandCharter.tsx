import React from 'react';
import { 
  Compass, 
  MapPin, 
  Phone, 
  Globe, 
  ExternalLink,
  Award,
  Layers,
  Heart
} from 'lucide-react';

export const BrandCharter = () => {
  const coreValues = [
    { letter: 'Z', word: 'Zealous', desc: 'Enthusiastic and passionate pursuit of knowledge, leadership, and personal growth goals.' },
    { letter: 'E', word: 'Excellence', desc: 'Striving consistently for the highest standard in character, academics, and collaborative spirit.' },
    { letter: 'R', word: 'Resilience', desc: 'Bouncing back from challenges with perseverance, courageous adaptability, and inner resolve.' },
    { letter: 'A', word: 'Authenticity', desc: 'Remaining true to honest principles, shaping moral transparency, and building mutual trust.' },
    { letter: 'O', word: 'Open-mindedness', desc: 'Embracing diverse insights, celebrating innovative creativity, and expanding global horizons.' },
    { letter: 'S', word: 'Sustainability', desc: 'Caring for local and global ecosystems, fostering long-term social growth, and resource preservation.' }
  ];

  return (
    <div className="space-y-16 max-w-4xl mx-auto animate-in fade-in duration-700">
      
      {/* Editorial Header Section */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-serif font-black text-zera-emerald tracking-tight">
          The Zera Charter
        </h1>
        <div className="w-16 h-1 bg-zera-yellow mx-auto rounded-full"></div>
        <p className="text-base text-natural-muted font-serif italic max-w-xl mx-auto leading-relaxed pt-2">
          "From a seed to a mighty tree."
        </p>
      </div>

      {/* Narrative Intro Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zera-emerald to-zera-emerald-dark text-white rounded-[2rem] p-10 md:p-14 shadow-xl border border-zera-emerald-dark">
        <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl pointer-events-none" />
        <div className="absolute left-0 bottom-0 w-96 h-96 bg-zera-yellow/5 rounded-full -ml-20 -mb-20 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-6">
          <h2 className="text-3xl font-serif font-bold text-zera-yellow">
            Finest education for all.
          </h2>
          
          <p className="text-base md:text-lg text-white/90 leading-relaxed font-sans font-light">
            Education is about more than academics — it is about shaping Courageous, Compassionate, and Committed leaders of tomorrow. We believe in providing a nurturing atmosphere where students thrive and realize their full potential.
          </p>

          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-6 text-sm text-white/80">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zera-yellow block mb-1">Our Motto</span>
              <p className="font-medium text-white">Finest education for all</p>
            </div>
            <div className="sm:pl-6 sm:border-l border-white/10">
              <span className="text-[10px] font-black uppercase tracking-widest text-zera-yellow block mb-1">Our Legacy</span>
              <p className="font-medium text-white">From a seed to a mighty tree</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vision & Mission Split without mechanical titles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 md:p-10 rounded-3xl border border-natural-border shadow-sm space-y-5 transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-zera-emerald/15 text-zera-emerald rounded-2xl flex items-center justify-center">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-serif font-black text-zera-emerald">Our Strategic Vision</h3>
          <p className="text-sm text-natural-text font-medium leading-relaxed">
            We are dedicated to building a school that shapes student character, inspiring them to explore their gifts and become the thoughtful, courageous leaders of tomorrow.
          </p>
        </div>

        <div className="bg-white p-8 md:p-10 rounded-3xl border border-natural-border shadow-sm space-y-5 transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-zera-yellow/15 text-zera-yellow-dark rounded-2xl flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-serif font-black text-zera-emerald">Our Core Mission</h3>
          <p className="text-sm text-natural-text font-medium leading-relaxed">
            Providing top-quality education in a supportive environment that celebrates three central pillars: <span className="font-bold text-zera-emerald">Curiosity</span> to learn, <span className="font-bold text-zera-emerald">Creativity</span> to solve, and <span className="font-bold text-zera-emerald">Collaboration</span> to build a better world together.
          </p>
        </div>
      </div>

      {/* Beautifully Crafted Core Values */}
      <div className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-serif font-black text-zera-emerald">The ZERAOS Foundations</h2>
          <p className="text-xs text-natural-muted uppercase tracking-widest">Guiding the development of student character</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {coreValues.map((val) => (
            <div 
              key={val.letter}
              className="bg-white p-6 rounded-2xl border border-natural-border shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[160px]"
            >
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-serif font-black text-zera-emerald group-hover:text-zera-yellow transition-colors leading-none">{val.letter}</span>
                  <span className="text-sm font-black text-natural-text uppercase tracking-widest">{val.word}</span>
                </div>
                <p className="text-xs font-medium leading-relaxed text-natural-muted flex-grow">
                  {val.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Location / General Contacts */}
      <div className="bg-white rounded-[2rem] border border-natural-border p-8 md:p-10 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        <div className="md:col-span-4 space-y-3">
          <div className="w-10 h-10 bg-zera-emerald/10 text-zera-emerald rounded-full flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-xl font-serif font-black text-zera-emerald">Administrative Contact</h3>
          <p className="text-xs text-natural-muted font-bold leading-relaxed">
            Reach out to the Zera Education Administrative Headquarters and primary archives registry.
          </p>
        </div>

        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6 text-[11px] font-bold">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-zera-emerald shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">Headquarters</span>
              <p className="text-natural-text leading-relaxed">
                Eco Palladium Block C #04-23,<br />
                Pusat Perdagangan Ekoflora, Jalan Ekoflora 7/5,<br />
                Taman Ekoflora, 81100 Johor Bahru, Malaysia.
              </p>
            </div>
          </div>

          <div className="space-y-3 sm:pl-4">
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-zera-emerald shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">Telephone</span>
                <p className="text-natural-text">+60 13-205 8869</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-zera-yellow-dark shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">Online Portal</span>
                <div className="flex items-center gap-3">
                  <a href="https://zera.edu.my" target="_blank" rel="noopener noreferrer" className="text-zera-emerald hover:underline inline-flex items-center gap-0.5 cursor-pointer">
                    zera.edu.my <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-natural-border">|</span>
                  <a href="https://linktr.ee/zera.education" target="_blank" rel="noopener noreferrer" className="text-zera-emerald hover:underline inline-flex items-center gap-0.5 cursor-pointer">
                    Linktree <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
