import React, { useState } from 'react';
import { 
  Globe, 
  ExternalLink, 
  Search, 
  BookOpen, 
  GraduationCap, 
  Library as LibraryIcon,
  Flame,
  Star,
  Gamepad2,
  HelpCircle,
  Code,
  Palette,
  ClipboardList
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Resource {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string;
  audience: 'Teacher' | 'Primary' | 'Secondary' | 'All';
  trending?: boolean;
  subject?: string;
  recommended?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Interactive Games': <Gamepad2 className="w-4 h-4" />,
  'Quiz Platforms': <HelpCircle className="w-4 h-4" />,
  'E-Books': <BookOpen className="w-4 h-4" />,
  'Subject Learning': <GraduationCap className="w-4 h-4" />,
  'Coding & STEM': <Code className="w-4 h-4" />,
  'Databases': <LibraryIcon className="w-4 h-4" />,
  'Creativity': <Palette className="w-4 h-4" />,
  'Teacher Tools': <ClipboardList className="w-4 h-4" />,
};

export const OnlineResources: React.FC = () => {
  const [activeAudience, setActiveAudience] = useState<'All' | 'Teacher' | 'Primary' | 'Secondary'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const resources: Resource[] = [
    // --- E-Books & Reading ---
    { id: '1', title: 'Oxford Owl', description: 'Free eBook library for primary students with fun activities.', url: 'https://www.oxfordowl.co.uk/', category: 'E-Books', audience: 'Primary', trending: true, recommended: true },
    { id: '2', title: 'Open Library', description: 'Millions of books available to read online or borrow.', url: 'https://openlibrary.org/', category: 'E-Books', audience: 'Secondary', trending: true },
    { id: 'pg-9', title: 'Project Gutenberg', description: 'Over 60,000 free eBooks, mostly older literary works.', url: 'https://www.gutenberg.org/', category: 'E-Books', audience: 'Secondary' },
    { id: '10', title: 'Storyline Online', description: 'Children’s literacy website that streams videos with celebrities reading books.', url: 'https://storylineonline.net/', category: 'E-Books', audience: 'Primary' },
    { id: '11', title: 'Epic!', description: 'Leading digital reading platform for kids 12 and under.', url: 'https://www.getepic.com/', category: 'E-Books', audience: 'Primary', recommended: true },
    { id: '12', title: 'LibriVox', description: 'Free public domain audiobooks read by volunteers.', url: 'https://librivox.org/', category: 'E-Books', audience: 'All' },
    { id: '13', title: 'Standard Ebooks', description: 'High-quality, free, and public domain ebooks.', url: 'https://standardebooks.org/', category: 'E-Books', audience: 'Secondary' },
    { id: '14', title: 'ManyBooks', description: 'Browse through a selection of the best free eBooks.', url: 'https://manybooks.net/', category: 'E-Books', audience: 'Secondary' },
    { id: '15', title: 'BookTrust', description: 'UK reading charity providing interactive books and games.', url: 'https://www.booktrust.org.uk/', category: 'E-Books', audience: 'Primary' },

    // --- Subject Learning ---
    { id: '4', title: 'Khan Academy', description: 'Personalized learning resource for all ages, specialized in Math and Science.', url: 'https://www.khanacademy.org/', category: 'Subject Learning', audience: 'All', trending: true },
    { id: '5', title: 'Nat Geo Kids', description: 'Science, history, and animal facts for young explorers.', url: 'https://kids.nationalgeographic.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '16', title: 'BBC Bitesize', description: 'Support for students in all school subjects across various levels.', url: 'https://www.bbc.co.uk/bitesize', category: 'Subject Learning', audience: 'All', recommended: true },
    { id: '17', title: 'BrainPOP', description: 'Animated educational site for kids - science, social studies, math, health, and more.', url: 'https://www.brainpop.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '18', title: 'CK-12 Foundation', description: 'High-quality, customizable open education resources.', url: 'https://www.ck12.org/student/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '19', title: 'Smithsonian Learning Lab', description: 'Access to Smithsonian archives for research and teaching.', url: 'https://learninglab.si.edu/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '20', title: 'Math Is Fun', description: 'Simple explanations and games for mathematical concepts.', url: 'https://www.mathsisfun.com/', category: 'Subject Learning', audience: 'All' },
    { id: '21', title: 'History.com', description: 'Rich repository of articles, videos, and facts about world history.', url: 'https://www.history.com/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '22', title: 'Wolfram Alpha', description: 'Computational intelligence engine for complex math and science.', url: 'https://www.wolframalpha.com/', category: 'Subject Learning', audience: 'Secondary', recommended: true },
    { id: '23', title: 'Bill Nye the Science Guy', description: 'Home of the Science Guy with experiments and educational videos.', url: 'https://www.billnye.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '24', title: 'Duolingo', description: 'The world\'s most popular language learning app.', url: 'https://www.duolingo.com/', category: 'Subject Learning', audience: 'All', trending: true },

    // --- Coding & STEM ---
    { id: '7', title: 'Code.org', description: 'Empowering students to learn computer science and the Hour of Code.', url: 'https://code.org/', category: 'Coding & STEM', audience: 'All', recommended: true },
    { id: '25', title: 'Scratch', description: 'Create stories, games, and animations. Share with others around the world.', url: 'https://scratch.mit.edu/', category: 'Coding & STEM', audience: 'Primary', recommended: true },
    { id: '26', title: 'W3Schools', description: 'Comprehensive tutorials on web development and programming.', url: 'https://www.w3schools.com/', category: 'Coding & STEM', audience: 'Secondary' },
    { id: '27', title: 'FreeCodeCamp', description: 'Learn to code for free and earn certifications.', url: 'https://www.freecodecamp.org/', category: 'Coding & STEM', audience: 'Secondary' },
    { id: '28', title: 'NASA Kids\' Club', description: 'Games and activities for kids to learn about space and NASA.', url: 'https://www.nasa.gov/kidsclub/index.html', category: 'Coding & STEM', audience: 'Primary' },
    { id: '29', title: 'Tynker', description: 'The fun way for kids to learn block-based and text coding.', url: 'https://www.tynker.com/', category: 'Coding & STEM', audience: 'Primary' },
    { id: '30', title: 'Arduino Education', description: 'Resources for STEAM learning through physical computing.', url: 'https://www.arduino.cc/en/Education', category: 'Coding & STEM', audience: 'Secondary' },
    { id: '31', title: 'NASA STEM', description: 'Educational resources from NASA for students and educators.', url: 'https://www.nasa.gov/stem', category: 'Coding & STEM', audience: 'All' },
    { id: '32', title: 'HowStuffWorks', description: 'Explanation of how the world really works through science and tech.', url: 'https://www.howstuffworks.com/', category: 'Coding & STEM', audience: 'Secondary' },

    // --- Databases & Research ---
    { id: '3', title: 'Google Scholar', description: 'Search across a wide variety of disciplines and sources.', url: 'https://scholar.google.com/', category: 'Databases', audience: 'Secondary' },
    { id: '6', title: 'ERIC', description: 'Comprehensive library of education research and information.', url: 'https://eric.ed.gov/', category: 'Databases', audience: 'Teacher' },
    { id: '33', title: 'JSTOR', description: 'Digital library of academic journals, books, and primary sources.', url: 'https://www.jstor.org/', category: 'Databases', audience: 'Secondary', recommended: true },
    { id: '34', title: 'PubMed', description: 'Free search engine accessing primarily the MEDLINE database.', url: 'https://pubmed.ncbi.nlm.nih.gov/', category: 'Databases', audience: 'Secondary' },
    { id: '35', title: 'Directory of Open Access Journals', description: 'Community-curated online directory that indexes open access journals.', url: 'https://doaj.org/', category: 'Databases', audience: 'Secondary' },
    { id: '36', title: 'Library of Congress', description: 'The largest library in the world with millions of books, recordings, and more.', url: 'https://www.loc.gov/', category: 'Databases', audience: 'All' },
    { id: '37', title: 'World Digital Library', description: 'Significant primary materials from countries and cultures around the world.', url: 'https://www.wdl.org/en/', category: 'Databases', audience: 'All' },

    // --- Quiz & Interactive ---
    { id: '9', title: 'Kahoot!', description: 'Make learning awesome through engaging game-based quizzes.', url: 'https://kahoot.com/', category: 'Quiz Platforms', audience: 'All', trending: true },
    { id: '38', title: 'Quizizz', description: 'Free self-paced quizzes to motivate every student.', url: 'https://quizizz.com/', category: 'Quiz Platforms', audience: 'All' },
    { id: '39', title: 'Quizlet', description: 'Learning tools and flashcards for any subject, for all levels.', url: 'https://quizlet.com/', category: 'Quiz Platforms', audience: 'All', recommended: true },
    { id: '40', title: 'Educandy', description: 'Make learning sweet by creating interactive games.', url: 'https://www.educandy.com/', category: 'Quiz Platforms', audience: 'Primary' },
    { id: '41', title: 'Gimkit', description: 'A game show for the classroom that students play live.', url: 'https://www.gimkit.com/', category: 'Quiz Platforms', audience: 'All' },
    { id: '42', title: 'Blooket', description: 'A new take on trivia and review games.', url: 'https://www.blooket.com/', category: 'Quiz Platforms', audience: 'All', trending: true },

    // --- Creativity & Design ---
    { id: '8', title: 'Canva Education', description: 'Empower every student and teacher to design and create.', url: 'https://www.canva.com/education/', category: 'Creativity', audience: 'All' },
    { id: '43', title: 'Behance', description: 'The world\'s largest creative network for showcasing creative work.', url: 'https://www.behance.net/', category: 'Creativity', audience: 'Secondary' },
    { id: '44', title: 'Adobe Express', description: 'Create professional graphics, videos, and web pages.', url: 'https://www.adobe.com/express/', category: 'Creativity', audience: 'Secondary' },
    { id: '45', title: 'Pixlr', description: 'Free online photo editor and design tools.', url: 'https://pixlr.com/', category: 'Creativity', audience: 'Secondary' },
    { id: '46', title: 'Tinkercad', description: 'Free, easy-to-use app for 3D design, electronics, and coding.', url: 'https://www.tinkercad.com/', category: 'Creativity', audience: 'All', recommended: true },
    { id: '47', title: 'Artsology', description: 'Art games for kids and educational resources.', url: 'https://artsology.com/', category: 'Creativity', audience: 'Primary' },
    { id: '48', title: 'Tate Kids', description: 'Art history, games, and quizzes from the Tate galleries.', url: 'https://www.tate.org.uk/kids', category: 'Creativity', audience: 'Primary' },

    // --- Teacher Tools ---
    { id: '49', title: 'TES Resources', description: 'Huge collection of teaching materials made by teachers.', url: 'https://www.tes.com/teaching-resources', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '50', title: 'Teachers Pay Teachers', description: 'Marketplace for original educational resources.', url: 'https://www.teacherspayteachers.com/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '51', title: 'Edutopia', description: 'Inspiration and evidence-based strategies for K-12 education.', url: 'https://www.edutopia.org/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '52', title: 'ClassDojo', description: 'Build a wonderful classroom community with students and parents.', url: 'https://www.classdojo.com/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '53', title: 'Padlet', description: 'Collaboration software that helps you create beautiful boards.', url: 'https://padlet.com/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '54', title: 'Twinkl', description: 'Instant access to over 600,000 teacher-made resources.', url: 'https://www.twinkl.com/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '55', title: 'Nearpod', description: 'Interactive lessons, videos, and formative assessments.', url: 'https://nearpod.com/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '56', title: 'Pear Deck', description: 'Active learning and feedback for every student in your classroom.', url: 'https://www.peardeck.com/', category: 'Teacher Tools', audience: 'Teacher' },

    // --- Additional Knowledge ---
    { id: '57', title: 'Ted-Ed', description: 'Lessons worth sharing from great educators around the world.', url: 'https://ed.ted.com/', category: 'Subject Learning', audience: 'All', trending: true },
    { id: '58', title: 'Coursera', description: 'Free online courses from top universities.', url: 'https://www.coursera.org/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '59', title: 'edX', description: 'Access 2000+ free online courses from 140 leading institutions.', url: 'https://www.edx.org/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '60', title: 'BrainyQuote', description: 'The world\'s largest quotation site.', url: 'https://www.brainyquote.com/', category: 'E-Books', audience: 'All' },
    { id: '61', title: 'FactCheck.org', description: 'Nonpartisan monitor of the accuracy of political claims.', url: 'https://www.factcheck.org/', category: 'Databases', audience: 'Secondary' },
    { id: '62', title: 'Ancient History Encyclopedia', description: 'Non-profit organization for ancient history education.', url: 'https://www.ancient.eu/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '63', title: 'CIA World Factbook', description: 'Information on the history, people, and society of world nations.', url: 'https://www.cia.gov/the-world-factbook/', category: 'Databases', audience: 'Secondary' },
    { id: '64', title: 'Space.com', description: 'The latest space exploration, innovation, and astronomy news.', url: 'https://www.space.com/', category: 'Coding & STEM', audience: 'All' },
    { id: '65', title: 'Science News for Students', description: 'Current events in science for ages 9 and up.', url: 'https://www.sciencenewsforstudents.org/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '66', title: 'BioDigital Human', description: '3D platform for visualizing anatomy, disease and treatments.', url: 'https://www.biodigital.com/', category: 'Coding & STEM', audience: 'Secondary' },
    { id: '67', title: 'Instructables', description: 'User-created DIY projects and educational guides.', url: 'https://www.instructables.com/', category: 'Creativity', audience: 'All' },
    { id: '68', title: 'Open Culture', description: 'The best free cultural and educational media on the web.', url: 'https://www.openculture.com/', category: 'Databases', audience: 'Secondary' },
    { id: '69', title: 'OER Commons', description: 'Public digital library of open educational resources.', url: 'https://www.oercommons.org/', category: 'Databases', audience: 'Teacher' },
    { id: '70', title: 'Curriki', description: 'Open educational resources for K-12 learning.', url: 'https://www.curriki.org/', category: 'Databases', audience: 'Teacher' },
    { id: '71', title: 'Merlot', description: 'Free and open online resources for higher education.', url: 'https://www.merlot.org/', category: 'Databases', audience: 'Secondary' },
    { id: '72', title: 'OpenStax', description: 'Free, peer-reviewed, openly licensed textbooks.', url: 'https://openstax.org/', category: 'E-Books', audience: 'Secondary' },
    { id: '73', title: 'The Metropolitan Museum of Art', description: 'Explore art and education from The Met.', url: 'https://www.metmuseum.org/', category: 'Creativity', audience: 'All' },
    { id: '74', title: 'National Gallery of Art', description: 'Access art and education resources from NGA.', url: 'https://www.nga.gov/', category: 'Creativity', audience: 'All' },
    { id: '75', title: 'Google Arts & Culture', description: 'Explore collections from around the world.', url: 'https://artsandculture.google.com/', category: 'Creativity', audience: 'All', recommended: true },
    { id: '76', title: 'Biography.com', description: 'Official source for high-quality biographies.', url: 'https://www.biography.com/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '77', title: 'BBC History', description: 'World history, from ancient to modern.', url: 'https://www.bbc.co.uk/history', category: 'Subject Learning', audience: 'Secondary' },
    { id: '78', title: 'Math Games', description: 'Free math games and worksheets.', url: 'https://www.mathgames.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '79', title: 'Starfall', description: 'Learning to read with phonics - for primary students.', url: 'https://www.starfall.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '80', title: 'ABCya', description: 'Educational games for kids.', url: 'https://www.abcya.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '81', title: 'Funbrain', description: 'Educational games for kids of all ages.', url: 'https://www.funbrain.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '82', title: 'CoolMath4Kids', description: 'Math lessons and games for kids.', url: 'https://www.coolmath4kids.com/', category: 'Subject Learning', audience: 'Primary' },
    { id: '83', title: 'Frontiers for Young Minds', description: 'Science for kids, edited by kids.', url: 'https://kids.frontiersin.org/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '84', title: 'Kids Activities Blog', description: 'Fun learning activities for young children.', url: 'https://kidsactivitiesblog.com/', category: 'Teacher Tools', audience: 'Primary' },
    { id: '85', title: 'Scholastic Learn at Home', description: 'Educational resources for learning at home.', url: 'https://classroommagazines.scholastic.com/support/learnathome.html', category: 'Subject Learning', audience: 'All' },
    { id: '86', title: 'Discovery Education', description: 'Experience the world in your classroom.', url: 'https://www.discoveryeducation.com/', category: 'Subject Learning', audience: 'All' },
    { id: '87', title: 'PBS LearningMedia', description: 'Videos, interactives, and lesson plans for teachers.', url: 'https://www.pbslearningmedia.org/', category: 'Teacher Tools', audience: 'Teacher' },
    { id: '88', title: 'National Archives', description: 'Primary sources for historical research.', url: 'https://www.archives.gov/', category: 'Databases', audience: 'Secondary' },
    { id: '89', title: 'NYPL Digital Collections', description: 'Search and browse digitized items from NYPL.', url: 'https://digitalcollections.nypl.org/', category: 'Databases', audience: 'All' },
    { id: '90', title: 'Europeana', description: 'Digitized cultural heritage from Europe.', url: 'https://www.europeana.eu/en', category: 'Databases', audience: 'All' },
    { id: '91', title: 'Biodiversity Heritage Library', description: 'Open access digital library of biology and biodiversity.', url: 'https://www.biodiversitylibrary.org/', category: 'Databases', audience: 'Secondary' },
    { id: '92', title: 'ArXiv', description: 'Open-access archive for 2 million scholarly articles.', url: 'https://arxiv.org/', category: 'Databases', audience: 'Secondary' },
    { id: '93', title: 'ResearchGate', description: 'Social networking site for scientists and researchers.', url: 'https://www.researchgate.net/', category: 'Databases', audience: 'Secondary' },
    { id: '94', title: 'Academia.edu', description: 'Platform for sharing academic research.', url: 'https://www.academia.edu/', category: 'Databases', audience: 'Secondary' },
    { id: '95', title: 'Scribd', description: 'Digital document library and subscription for ebooks.', url: 'https://www.scribd.com/', category: 'E-Books', audience: 'All' },
    { id: '96', title: 'Issuu', description: 'Digital discovery and publishing platform.', url: 'https://issuu.com/', category: 'E-Books', audience: 'All' },
    { id: '97', title: 'Medium', description: 'The best place on the internet to read and write.', url: 'https://medium.com/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '98', title: 'Quora', description: 'A place to share knowledge and better understand the world.', url: 'https://www.quora.com/', category: 'Subject Learning', audience: 'Secondary' },
    { id: '99', title: 'Lifehacker', description: 'Tips, tricks, and downloads for getting things done.', url: 'https://lifehacker.com/', category: 'Teacher Tools', audience: 'All' },
    { id: '100', title: 'Mental Floss', description: 'Amazing facts and trivia about everything.', url: 'https://www.mentalfloss.com/', category: 'Subject Learning', audience: 'All' },
    { id: '101', title: 'Wired', description: 'The latest in tech, science, and culture news.', url: 'https://www.wired.com/', category: 'Subject Learning', audience: 'Secondary' },
  ];

  const categories = ['All', ...Array.from(new Set(resources.map(r => r.category)))];

  const filtered = resources.filter(res => {
    const matchesAudience = activeAudience === 'All' || res.audience === activeAudience || res.audience === 'All';
    const matchesCategory = activeCategory === 'All' || res.category === activeCategory;
    const matchesSearch = res.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          res.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAudience && matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-natural-border">
        <div>
          <h2 className="text-3xl font-serif font-black text-zera-emerald">Digital Gateway</h2>
          <p className="text-natural-muted font-medium">Curated intellectual assets for Zera International scholars.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-natural-border shadow-sm overflow-x-auto no-scrollbar">
          {['All', 'Primary', 'Secondary', 'Teacher'].map((aud) => (
            <button
              key={aud}
              onClick={() => setActiveAudience(aud as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeAudience === aud ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
              )}
            >
              {aud}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <form onSubmit={(e) => e.preventDefault()} className="relative col-span-1 md:col-span-2 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-yellow transition-colors" />
          <input 
            type="text"
            placeholder="Search by title, subject or category..."
            className="w-full pl-12 pr-28 py-4 bg-white border border-natural-border rounded-3xl outline-none focus:ring-2 focus:ring-zera-yellow shadow-sm transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-zera-yellow text-zera-emerald-dark px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-sm"
          >
            Search
          </button>
        </form>
        <div className="bg-zera-emerald/5 border border-zera-emerald/10 p-4 rounded-3xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zera-yellow/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-zera-yellow-dark" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zera-emerald uppercase tracking-widest leading-none mb-1">Trending</p>
            <p className="text-sm font-bold text-natural-text">Oxford Owl</p>
          </div>
        </div>
        <div className="bg-zera-emerald/5 border border-zera-emerald/10 p-4 rounded-3xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zera-emerald/10 flex items-center justify-center">
            <Star className="w-5 h-5 text-zera-emerald" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zera-emerald uppercase tracking-widest leading-none mb-1">Weekly Pick</p>
            <p className="text-sm font-bold text-natural-text">Code.org</p>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 p-1 bg-natural-border/20 rounded-2xl overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
              activeCategory === cat ? "bg-white text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((res) => (
          <div key={res.id} className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col group h-full relative overflow-hidden">
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-zera-emerald/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 duration-700" />
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border", 
                res.audience === 'Teacher' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                res.audience === 'Primary' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                res.audience === 'Secondary' ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-natural-bg text-natural-muted border-natural-border'
              )}>
                {res.audience === 'All' ? 'Institutional' : res.audience}
              </div>
              <div className="flex gap-1">
                {res.trending && (
                  <div className="p-1.5 bg-zera-yellow/20 rounded-lg text-zera-yellow-dark">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                )}
                {res.recommended && (
                  <div className="p-1.5 bg-zera-emerald/10 rounded-lg text-zera-emerald">
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </div>
                )}
              </div>
            </div>
            
            <h3 className="text-lg font-black text-zera-emerald group-hover:text-zera-yellow-dark transition-colors relative z-10">{res.title}</h3>
            <p className="text-xs text-natural-muted mt-2 mb-6 font-semibold leading-relaxed flex-1 relative z-10">{res.description}</p>
            
            <div className="mt-auto pt-6 border-t border-natural-border flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-natural-bg rounded-xl text-zera-emerald group-hover:bg-zera-emerald group-hover:text-white transition-colors">
                  {CATEGORY_ICONS[res.category] || <Globe className="w-4 h-4" />}
                </div>
                <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">{res.category}</span>
              </div>
              <a 
                href={res.url} 
                target="_blank" 
                rel="no-referrer"
                className="p-3 bg-zera-yellow text-zera-emerald-dark rounded-2xl hover:bg-zera-emerald hover:text-white transition-all shadow-sm flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider"
              >
                Access <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-natural-border">
          <div className="w-16 h-16 bg-natural-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-natural-muted opacity-30" />
          </div>
          <p className="text-natural-muted font-serif italic text-lg capitalize">No intellectual assets found in this archive.</p>
          <button 
            onClick={() => { setSearchTerm(''); setActiveCategory('All'); setActiveAudience('All'); }}
            className="mt-4 text-xs font-bold text-zera-emerald hover:underline"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default OnlineResources;
