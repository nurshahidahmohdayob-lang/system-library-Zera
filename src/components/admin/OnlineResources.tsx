import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  ExternalLink, 
  Search, 
  BookOpen, 
  Languages,
  Flame,
  Star,
  Database,
  HelpCircle,
  Gamepad2,
  Award,
  GraduationCap
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Resource {
  id: string;
  title: string;
  description: string;
  url: string;
  category: 'E-Books' | 'Databases & Research' | 'Quiz Platforms' | 'Interactive Games' | 'Assessment Tools' | 'Subject Learning';
  audience: 'Primary' | 'Secondary' | 'All';
  language: 'English' | 'Chinese / Mandarin' | 'Bahasa Melayu';
  trending?: boolean;
  recommended?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'E-Books': <BookOpen className="w-4 h-4" />,
  'Databases & Research': <Database className="w-4 h-4" />,
  'Quiz Platforms': <HelpCircle className="w-4 h-4" />,
  'Interactive Games': <Gamepad2 className="w-4 h-4" />,
  'Assessment Tools': <Award className="w-4 h-4" />,
  'Subject Learning': <GraduationCap className="w-4 h-4" />,
};

export const OnlineResources: React.FC = () => {
  const [activeAudience, setActiveAudience] = useState<'All' | 'Primary' | 'Secondary'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLanguage, setActiveLanguage] = useState<'All' | 'English' | 'Chinese / Mandarin' | 'Bahasa Melayu'>('All');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeAudience, searchTerm, activeLanguage, activeCategory]);

  const resources: Resource[] = [
    // ==========================================
    // --- English Level Resources ---
    // ==========================================
    
    // --- E-Books ---
    { id: 'oxford-owl', title: 'Oxford Owl e-Library', description: 'A free, tablet-friendly digital reading library from Oxford University Press designed to build core literacy skills in young primary school students.', url: 'https://www.oxfordowl.co.uk/for-home/find-a-book/library-page/', category: 'E-Books', audience: 'Primary', language: 'English', trending: true, recommended: true },
    { id: 'epic-books', title: 'Epic! School Library', description: 'The premier digital reading service for primary students, providing instant access to thousands of high-quality illustrated children\'s books and educational stories.', url: 'https://www.getepic.com/', category: 'E-Books', audience: 'Primary', language: 'English', recommended: true },
    { id: 'storyline-online', title: 'Storyline Online', description: 'An award-winning English literary platform streaming premium video storybooks narrated by celebrated actors to boost literacy and pronunciation.', url: 'https://storylineonline.net/', category: 'E-Books', audience: 'Primary', language: 'English' },
    { id: 'k12-openlibrary', title: 'K-12 Open Library', description: 'A colossal repository of classic school novels, curated standard literature, and public domain materials safe for secondary school classroom reading.', url: 'https://openlibrary.org/', category: 'E-Books', audience: 'Secondary', language: 'English', trending: true },
    { id: 'gutenberg-youth', title: 'Project Gutenberg (Youth)', description: 'More than 60,000 public domain classical literature creations, anthologies, and historical pieces ideal for secondary research and literature studies.', url: 'https://www.gutenberg.org/wiki/Children%27s_Literature_(Bookshelf)', category: 'E-Books', audience: 'Secondary', language: 'English' },
    { id: 'unite-for-literacy', title: 'Unite for Literacy Library', description: 'Dozens of beautifully photographed, easy-to-read nonfiction e-books designed to build vocabulary in primary emergent readers with multilingual audio supports.', url: 'https://www.uniteforliteracy.com/', category: 'E-Books', audience: 'Primary', language: 'English' },
    { id: 'follett-lightspeed', title: 'Follett Destiny Discover', description: 'Educational reading search gateway designed for schools, offering interactive books, audiobooks, and textbook chapters for kindergarten through secondary students.', url: 'https://www.follettlearning.com/', category: 'E-Books', audience: 'All', language: 'English' },
    { id: 'vooks-storybooks', title: 'Vooks Animated Audiobooks', description: 'Polished animated children\'s storybooks that add slow-paced, non-distracting screen movement and highlighted text to build word association to primary readers.', url: 'https://www.vooks.com/', category: 'E-Books', audience: 'Primary', language: 'English' },

    // --- Databases & Research ---
    { id: 'britannica-school', title: 'Britannica School Kids', description: 'A highly secure, student-safe electronic encyclopedia and historical reference directory with structured content for primary and middle school research projects.', url: 'https://www.britannica.com/', category: 'Databases & Research', audience: 'Primary', language: 'English', recommended: true },
    { id: 'google-scholar-sec', title: 'Google Scholar Research Gateway', description: 'Vast intellectual repository index suitable for secondary school students conducting complex essays, science fair projects, and citation reports.', url: 'https://scholar.google.com/', category: 'Databases & Research', audience: 'Secondary', language: 'English' },
    { id: 'nasa-kids-club', title: 'NASA Kids\' Club Science Portal', description: 'An interactive database of space observations, spacecraft telemetry, astronaut diaries, and astronomical image databases adjusted for school comprehension and class projects.', url: 'https://www.nasa.gov/learning-resources/nasa-kids-club/', category: 'Databases & Research', audience: 'Primary', language: 'English', recommended: true },
    { id: 'natgeo-kids', title: 'National Geographic Kids Explorer', description: 'Exploration database presenting wildlife records, geographical maps, archaeology projects, and natural science databases suitable for primary school investigations.', url: 'https://kids.nationalgeographic.com/', category: 'Databases & Research', audience: 'Primary', language: 'English', trending: true },
    { id: 'world-book-online', title: 'World Book Student Portal', description: 'Rich reference collection supplying primary and high school students with primary sources, interactive maps, comparative statistics, and peer-reviewed educational articles.', url: 'https://www.worldbookonline.com/', category: 'Databases & Research', audience: 'All', language: 'English' },
    { id: 'sweetsearch-edu', title: 'SweetSearch Student Search', description: 'A search engine for students that searches only high-quality, pre-screened websites evaluated by educators and librarians to fast-track research projects.', url: 'https://www.sweetsearch.com/', category: 'Databases & Research', audience: 'Secondary', language: 'English' },
    { id: 'smithsonian-learning', title: 'Smithsonian Learning Lab', description: 'Millions of safe digital artifacts, historical archive collections, scientific datasets, and interactive exhibits curated for classroom assignments.', url: 'https://learninglab.si.edu/', category: 'Databases & Research', audience: 'Secondary', language: 'English' },
    { id: 'sweet-water-database', title: 'USGS Water Science Directory', description: 'Rich water research database displaying water quality reports, cycle maps, and atmospheric datasets ideal for secondary school geography and earth sciences.', url: 'https://www.usgs.gov/special-topics/water-science-school', category: 'Databases & Research', audience: 'Secondary', language: 'English' },

    // --- Quiz Platforms ---
    { id: 'quizizz-edu', title: 'Quizizz Educational Live Quizzes', description: 'Interactive classroom quizzes and trivia games aligned with primary and secondary learning checkins, self-paced tests, and vocabulary activities.', url: 'https://quizizz.com/', category: 'Quiz Platforms', audience: 'All', language: 'English', trending: true },
    { id: 'kahoot-learning', title: 'Kahoot! Play and Learn', description: 'A stellar interactive classroom quiz engine supporting real-time group collaboration, competitive quizzes, and friendly spelling check-ins.', url: 'https://kahoot.com/', category: 'Quiz Platforms', audience: 'All', language: 'English' },
    { id: 'gimkit-live', title: 'Gimkit Class Game Shows', description: 'An interactive live-quiz system designed by a high school student where academic performance allows players to earn virtual currency to purchase power-ups.', url: 'https://www.gimkit.com/', category: 'Quiz Platforms', audience: 'All', language: 'English', recommended: true },
    { id: 'blooket-play', title: 'Blooket Interactive Trivia', description: 'Action-oriented quiz system where students answer quick revision questions to progress in real-time tower-defense, tycoon, or strategy mini-games.', url: 'https://www.blooket.com/', category: 'Quiz Platforms', audience: 'All', language: 'English', trending: true },
    { id: 'nearpod-interactive', title: 'Nearpod Interactive Presentations', description: 'Allows teachers to present active slides featuring built-in matching pairs, polling questions, 3D orbits, and open-ended student quick-quizzes.', url: 'https://nearpod.com/', category: 'Quiz Platforms', audience: 'All', language: 'English' },
    { id: 'mentimeter-edu', title: 'Mentimeter Class Polls', description: 'Active student polling portal, word cloud builder, and interactive quiz system designed to capture live class responses and test reading comprehension.', url: 'https://www.mentimeter.com/', category: 'Quiz Platforms', audience: 'Secondary', language: 'English' },
    { id: 'classtools-net', title: 'ClassTools Arcade & Tools', description: 'Enables creation of custom student quizzes, timeline generators, fake text generators, and retro arcade-style review activities for studying history.', url: 'https://www.classtools.net/', category: 'Quiz Platforms', audience: 'All', language: 'English' },

    // --- Interactive Games ---
    { id: 'abcya-games', title: 'ABCya Educational Games', description: 'Hundreds of interactive, colorful literacy and numbers-oriented games for primary grade students to build logic in a safe, play-first environment.', url: 'https://www.abcya.com/', category: 'Interactive Games', audience: 'Primary', language: 'English', recommended: true },
    { id: 'scratch-creative', title: 'Scratch Coding Community', description: 'Create interactive animations, visual blocks and logic-driven retro games designed by MIT to safely teach students computer science principles.', url: 'https://scratch.mit.edu/', category: 'Interactive Games', audience: 'All', language: 'English' },
    { id: 'pbs-kids-games', title: 'PBS KIDS Educational Games', description: 'Wholesome learning games featuring popular children\'s characters that reinforce primary literacy, numeracy, and cooperative skills.', url: 'https://pbskids.org/games/', category: 'Interactive Games', audience: 'Primary', language: 'English' },
    { id: 'math-playground', title: 'Math Playground', description: 'Fun geometry, fractions, and algebra logical training exercises presented as engaging puzzle games and speed-challenges for elementary grades.', url: 'https://www.mathplayground.com/', category: 'Interactive Games', audience: 'Primary', language: 'English' },
    { id: 'prodigy-math', title: 'Prodigy Math Fantasy Adventure', description: 'Explore a rich fantasy adventure world where casting spells and moving forward in quests requires solving level-aligned math equations.', url: 'https://www.prodigygame.com/', category: 'Interactive Games', audience: 'Primary', language: 'English', trending: true },
    { id: 'coolmath-games', title: 'Coolmath Games Logic Lab', description: 'Engaging, physics-based grid puzzles, strategy boards, and spatial reasoning games loved by intermediate and high school students.', url: 'https://www.coolmathgames.com/', category: 'Interactive Games', audience: 'Secondary', language: 'English' },
    { id: 'typing-club', title: 'TypingClub Keyboard Trainer', description: 'Gamified touch-typing course teaching hand positioning, finger-muscle memory, and layout speed through interactive reward levels.', url: 'https://www.typingclub.com/', category: 'Interactive Games', audience: 'All', language: 'English', recommended: true },
    { id: 'funbrain-learning', title: 'Funbrain Grade-School Arcade', description: 'Interactive learning books and mathematics games that build academic problem-solving skills in primary and middle school students.', url: 'https://www.funbrain.com/', category: 'Interactive Games', audience: 'Primary', language: 'English' },

    // --- Assessment Tools ---
    { id: 'quizlet-study', title: 'Quizlet Active Recall Flashcard Deck', description: 'Powerful student-configured check-ins, study cards, mock tests, and memorization exercises supporting standard secondary school biology, history, and chemistry revisions.', url: 'https://quizlet.com/', category: 'Assessment Tools', audience: 'Secondary', language: 'English', trending: true },
    { id: 'socrative-check', title: 'Socrative Student-In Assessment', description: 'Instant student performance check-ins, custom quizzes, exit-slips, and dynamic classroom feedback modules for educational progress reports.', url: 'https://www.socrative.com/', category: 'Assessment Tools', audience: 'All', language: 'English' },
    { id: 'flippity-templates', title: 'Flippity Google Sheet Activities', description: 'Converts simple spreadsheet inputs into interactive flashcards, jeopardy-style boards, badge trackers, and virtual escape rooms.', url: 'https://www.flippity.net/', category: 'Assessment Tools', audience: 'Secondary', language: 'English' },
    { id: 'edpuzzle-video', title: 'Edpuzzle Video Assessments', description: 'Enables insertion of short audio comments, open-ended comprehension questions, and multiple-choice checkpoints directly into movie clips or document lessons.', url: 'https://edpuzzle.com/', category: 'Assessment Tools', audience: 'Secondary', language: 'English', recommended: true },
    { id: 'formative-assessment', title: 'Formative (GoFormative) Tracker', description: 'Real-time assessment platform supplying teachers with instant student typing inputs, drawing boards, and written arguments to adapt lessons.', url: 'https://www.formative.com/', category: 'Assessment Tools', audience: 'Secondary', language: 'English' },
    { id: 'padlet-collaboration', title: 'Padlet Digital Pinboards', description: 'Collaborative bulletin wall where students pin research links, photos, short essays, and presentation files for easy peer-assessment.', url: 'https://padlet.com/', category: 'Assessment Tools', audience: 'All', language: 'English' },
    { id: 'plickers-cards', title: 'Plickers Paperless Evaluation', description: 'Enables instant feedback evaluations where students hold up barcode-style cardboard cards, instantly scanned by a teacher\'s phone camera.', url: 'https://www.plickers.com/', category: 'Assessment Tools', audience: 'Primary', language: 'English' },

    // --- Subject Learning ---
    { id: 'khan-academy-global', title: 'Khan Academy Masterclasses', description: 'A completely free personalized dashboard allowing students to study Math, Chemistry, Biology, Physics, and history through step-by-step videos.', url: 'https://www.khanacademy.org/', category: 'Subject Learning', audience: 'All', language: 'English', recommended: true },
    { id: 'bbc-bitesize-revision', title: 'BBC Bitesize Revision Guides', description: 'Interactive topic breakdowns, short informative videos, curriculum support, and safe revision worksheets across core school disciplines.', url: 'https://www.bbc.co.uk/bitesize', category: 'Subject Learning', audience: 'All', language: 'English', trending: true },
    { id: 'ck12-foundation', title: 'CK-12 FlexBook Platform', description: 'Vast secondary school STEM library supplying customizable, standards-aligned free digital textbook modules with integrated simulations.', url: 'https://www.ck12.org/student/', category: 'Subject Learning', audience: 'Secondary', language: 'English', recommended: true },
    { id: 'code-org-academy', title: 'Code.org Hour of Code', description: 'Introductory block coding activities, App Labs, and AI concepts tutorials designed to build secondary computational logic in a gamified way.', url: 'https://code.org/', category: 'Subject Learning', audience: 'All', language: 'English', trending: true },
    { id: 'ted-ed-lessons', title: 'TED-Ed Animations & Lessons', description: 'Captivating short animations detailing scientific theories, major historical epochs, literary deep-dives, and complex mathematical riddles.', url: 'https://ed.ted.com/', category: 'Subject Learning', audience: 'Secondary', language: 'English' },
    { id: 'geogebra-math', title: 'GeoGebra Dynamic Math Lab', description: 'Interactive geometry, algebra, 3D modeling curves, physics graphing, and dynamic calculus boards built for secondary students.', url: 'https://www.geogebra.org/', category: 'Subject Learning', audience: 'Secondary', language: 'English' },
    { id: 'colorado-phet', title: 'PhET Interactive Simulations', description: 'University of Colorado Boulder\'s interactive physics, chemistry, thermodynamics, and math laboratory simulators suitable for high school coursework.', url: 'https://phet.colorado.edu/', category: 'Subject Learning', audience: 'Secondary', language: 'English', recommended: true },
    { id: 'crash-course-kids', title: 'Crash Course Kids Science', description: 'Lively, fast-paced animated science show covering primary-grade chemistry, physical science, ecosystems, and space sciences.', url: 'https://www.youtube.com/user/crashcoursekids', category: 'Subject Learning', audience: 'Primary', language: 'English' },
    { id: 'duolingo-languages', title: 'Duolingo Language Academy', description: 'Bite-sized, gamified language acquisition software that turns grammar rules, vocabularies, and listening practice into rewarding, streak-building quests.', url: 'https://www.duolingo.com/', category: 'Subject Learning', audience: 'All', language: 'English' },
    { id: 'sci-show-kids', title: 'SciShow Kids Discovery Channel', description: 'Explores the complex questions kids ask through engaging video segments, scientific experiments, and animal encounters designed for primary grades.', url: 'https://www.youtube.com/c/scishowkids', category: 'Subject Learning', audience: 'Primary', language: 'English' },

    // ==========================================
    // --- Chinese / Mandarin Resources ---
    // ==========================================
    
    // --- E-Books ---
    { id: 'storybooks-china', title: 'Storybooks China (故事书中国)', description: 'Free, interactive children\'s storybooks with native speaker audio, custom Pinyin toggles, and English translation to build primary reading confidence.', url: 'https://storybooks-china.org/', category: 'E-Books', audience: 'Primary', language: 'Chinese / Mandarin', recommended: true },
    { id: 'du-chinese', title: 'Du Chinese Graded Reader', description: 'High-quality digital graded Chinese reader service utilizing safe, interesting news snippets, fairy tales, and daily dialogues for primary and secondary language learners.', url: 'https://www.duchinese.net/', category: 'E-Books', audience: 'Secondary', language: 'Chinese / Mandarin', trending: true },
    { id: 'soobic-library', title: 'Soobic Illustrated Chinese (书比故事)', description: 'Visually vibrant Chinese storybook repositories, short traditional myths, and basic flashcard vocabulary resources perfect for elementary schools.', url: 'https://www.soobic.com/', category: 'E-Books', audience: 'Primary', language: 'Chinese / Mandarin' },
    { id: 'yes-chinese-ebooks', title: 'YesChinese Reading Bookshelf (中文阅读)', description: 'A structured digital bookshelf featuring classic Chinese fairytales, youth-oriented moral fables, and level-rated Mandarin readers with vocabulary hints.', url: 'https://www.yeschinese.com/', category: 'E-Books', audience: 'All', language: 'Chinese / Mandarin' },
    { id: 'chinese-gutenberg-classics', title: 'Project Gutenberg (Chinese Classics)', description: 'Digitized copies of classic historical masterpieces, classical Chinese poetry, and literature pieces for advanced secondary school students.', url: 'https://www.gutenberg.org/browse/languages/zh', category: 'E-Books', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'hujiang-children-bm', title: 'HuJiang Kids Chinese Gateway (沪江少儿)', description: 'Popular Chinese kids literary portal offering classic story modules, rhymes, bedtime tales, and simplified level-readers for early Chinese learners.', url: 'https://saber.hujiang.com/', category: 'E-Books', audience: 'Primary', language: 'Chinese / Mandarin' },

    // --- Databases & Research ---
    { id: 'ctext-classical', title: 'Chinese Text Project (中国哲学书电子化计划)', description: 'A colossal, highly respected digital database of historical texts, classics, and translation tools for secondary students doing intermediate to advanced Chinese studies.', url: 'https://ctext.org/', category: 'Databases & Research', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'baidu-baike', title: 'Baidu Baike (百度百科)', description: 'A massive, highly granular Chinese-language collaborative online encyclopedia suitable for student research into Asian science, literature, and geography.', url: 'https://baike.baidu.com/', category: 'Databases & Research', audience: 'Secondary', language: 'Chinese / Mandarin', trending: true },
    { id: 'sinica-digital', title: 'Academia Sinica Historical Portal', description: 'Traditional archives, historical archaeological excavations, and ancient calligraphy databases curated for high school historical coursework and research papers.', url: 'http://www.sinica.edu.tw/', category: 'Databases & Research', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'china-knowledge', title: 'ChinaKnowledge Reference Hub', description: 'An encyclopedia and reference database outlining traditional history, geography, arts, and key architectural elements of historical China.', url: 'http://www.chinaknowledge.de/', category: 'Databases & Research', audience: 'Secondary', language: 'Chinese / Mandarin' },

    // --- Quiz & Assessment ---
    { id: 'chinesetest-hsk', title: 'Official HSK Practice & Evaluation Portal', description: 'Excellent Chinese proficiency diagnostic assessments, self-testing, character identification modules, and vocabulary evaluations for secondary school students.', url: 'https://www.chinesetest.cn/', category: 'Assessment Tools', audience: 'Secondary', language: 'Chinese / Mandarin', recommended: true },
    { id: 'clavis-sinica', title: 'Clavis Sinica Character Diagnostics', description: 'Innovative text analytics and diagnostic tools that allow intermediate and advanced Chinese scholars to test word-meaning and study character structure.', url: 'https://www.clavissinica.com/', category: 'Assessment Tools', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'arch-chinese', title: 'Arch Chinese Character Drills', description: 'Features custom stroke order validators, handwriting recognition checkers, and flashcard quizzes optimized for testing grade-school Chinese spelling.', url: 'https://www.archchinese.com/', category: 'Assessment Tools', audience: 'All', language: 'Chinese / Mandarin', trending: true },
    { id: 'hsk-academy-test', title: 'HSK Academy Diagnostic Suite', description: 'A complete evaluation platform for secondary and high school students preparing for international HSK exams with timed grammar sets.', url: 'https://www.hskacademy.com/', category: 'Assessment Tools', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'chinese-quizlet-deck', title: 'Quizlet Chinese Character Packs', description: 'User-curated active recall study decks focusing on standard Chinese radicals, Pinyin rules, and everyday conversational Chinese vocabularies.', url: 'https://quizlet.com/subject/chinese/', category: 'Quiz Platforms', audience: 'All', language: 'Chinese / Mandarin' },
    { id: 'kahoot-mandarin', title: 'Kahoot! Mandarin Vocab Arena', description: 'Real-time Chinese vocabulary match-ups, basic glyph identification challenges, and interactive multiplayer word quizzes designed for students.', url: 'https://kahoot.com/explore/chinese-learning/', category: 'Quiz Platforms', audience: 'All', language: 'Chinese / Mandarin' },

    // --- Interactive Games ---
    { id: 'chalk-academy-zh', title: 'Chalk Academy Chinese Playroom', description: 'Bilingual play-oriented character recognition activities, card pairing games, and digital puzzles suited for Chinese language learners in primary school.', url: 'https://chalkacademy.com/', category: 'Interactive Games', audience: 'Primary', language: 'Chinese / Mandarin' },
    { id: 'maobi-writing-game', title: 'Maobi Interactive Stroke Order Game', description: 'Engaging character writing practice game teaching core stroke direction, balance, and pronunciation of Chinese glyphs through beautiful responsive visuals.', url: 'https://maobi.eu/', category: 'Interactive Games', audience: 'All', language: 'Chinese / Mandarin', trending: true },
    { id: 'yes-chinese-games', title: 'YesChinese Language Games', description: 'An interactive arena containing memory cards, word finders, and stroke-direction puzzle games designed to make primary school Mandarin learning fun.', url: 'https://www.yeschinese.com/en/game/', category: 'Interactive Games', audience: 'Primary', language: 'Chinese / Mandarin', recommended: true },
    { id: 'mandarin-games-edu', title: 'Chinese Games Online', description: 'Primary-level typing training games, spelling speed challenges, and interactive vocabulary boards that accelerate children\'s phonetic Pinyin recognition.', url: 'http://www.chinesegames.org/', category: 'Interactive Games', audience: 'Primary', language: 'Chinese / Mandarin' },

    // --- Subject Learning ---
    { id: 'lingoace-hub', title: 'LingoAce Kids Mandarin Hub', description: 'Immersive, visually rich curriculum structures, grammar logs, interactive slides, and culture-centric language lessons designed for young language scholars.', url: 'https://www.lingoace.com/', category: 'Subject Learning', audience: 'Primary', language: 'Chinese / Mandarin', recommended: true },
    { id: 'little-fox-chinese', title: 'Little Fox Chinese Animated Academy', description: 'A treasure trove of highly engaging animated Chinese folktales, vocabulary songs, and progressive level-by-level conversational lessons for primary students.', url: 'https://chinese.littlefox.com/', category: 'Subject Learning', audience: 'Primary', language: 'Chinese / Mandarin', trending: true },
    { id: 'bbc-languages-chinese', title: 'BBC Languages Chinese Essentials', description: 'Comprehensive video audio modules teaching Mandarin pronunciation, key tonal distinctions, everyday phrases, and foundational grammatical rules.', url: 'http://www.bbc.co.uk/languages/chinese/', category: 'Subject Learning', audience: 'All', language: 'Chinese / Mandarin' },
    { id: 'chinese-boost-grammar', title: 'Chinese Boost Grammar Lab', description: 'Meticulous, grammar-focused articles, syntax breakdown tables, and particle usage rules tailored specifically for high school Mandarin coursework.', url: 'https://www.chineseboost.com/', category: 'Subject Learning', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'mandarin-blueprint-docs', title: 'Mandarin Blueprint Pronunciation Course', description: 'Teaches correct mouth-positioning, pinyin blends, and systemized memory techniques to recognize hundreds of complex characters in high school.', url: 'https://www.mandarinblueprint.com/', category: 'Subject Learning', audience: 'Secondary', language: 'Chinese / Mandarin' },
    { id: 'yoyo-chinese-lessons', title: 'Yoyo Chinese Lesson Library', description: 'Interactive video lectures that break down conversational Chinese into practical, logical steps using helpful English comparisons for students.', url: 'https://yoyochinese.com/', category: 'Subject Learning', audience: 'All', language: 'Chinese / Mandarin', recommended: true },

    // ==========================================
    // --- Bahasa Melayu Resources ---
    // ==========================================
    
    // --- E-Books ---
    { id: 'jendela-dbp', title: 'Jendela DBP (Dewan Bahasa dan Pustaka)', description: 'Official Malaysian national library database offering digitized national literature, kids magazines, and traditional folklore (buku bergambar) to build national literacy.', url: 'https://jendeladbp.my/', category: 'E-Books', audience: 'All', language: 'Bahasa Melayu', recommended: true },
    { id: 'storybooks-malaysia', title: 'Buku Cerita BM (Storybooks Malaysia)', description: 'Local primary reading resource presenting illustrated stories in both simple Bahasa Melayu and English to accelerate childhood vocabulary and spelling.', url: 'https://storybooksmalaysia.net/', category: 'E-Books', audience: 'Primary', language: 'Bahasa Melayu', trending: true },
    { id: 'itbm-ebooks', title: 'ITBM Buku Pendidikan Digital', description: 'Malaysian Institute of Translation and Books educational portal supplying digitized school reference guides, high school literature and children\'s books.', url: 'https://itbm.com.my/', category: 'E-Books', audience: 'Secondary', language: 'Bahasa Melayu' },
    { id: 'pnm-e-resources', title: 'Perpustakaan Negara Digital (e-PNM)', description: 'Access to thousands of educational books, children\'s science magazines, and historical documents in Malay, provided by the National Library of Malaysia.', url: 'https://e-pnm.gov.my/', category: 'E-Books', audience: 'All', language: 'Bahasa Melayu', recommended: true },
    { id: 'pustaka-tun-lim', title: 'Pustaka Kanak-Kanak PNM', description: 'An interactive digital bookshelf showcasing local Malay folklore and modern primary school-appropriate bedtime stories with audio overlays.', url: 'https://www.pnm.gov.my/', category: 'E-Books', audience: 'Primary', language: 'Bahasa Melayu' },

    // --- Databases & Research ---
    { id: 'upustaka-consortium', title: 'u-Pustaka Konsortium Negara', description: 'The official digital library consortium of Malaysia, giving students free logged search access to thousands of educational journals, articles, and databases.', url: 'https://www.u-pustaka.gov.my/', category: 'Databases & Research', audience: 'Secondary', language: 'Bahasa Melayu', recommended: true },
    { id: 'myjurnal-citation', title: 'MyJurnal Kedirektoran Jurnal Malaysia', description: 'Vast database indexing professional Malaysian research journals and academic studies, suitable for high school essays and STPM/school projects.', url: 'http://www.myjurnal.my/', category: 'Databases & Research', audience: 'Secondary', language: 'Bahasa Melayu' },
    { id: 'dbp-kamus-prpm', title: 'Rujukan Persuratan Melayu (PRPM DBP)', description: 'The definitive Malaysian orthography database containing the Kamus Dewan dictionary, thesauruses, and official terms compiled by Dewan Bahasa dan Pustaka.', url: 'https://prpm.dbp.gov.my/', category: 'Databases & Research', audience: 'All', language: 'Bahasa Melayu', trending: true },
    { id: 'arkib-negara', title: 'Portal Penyelidikan Arkib Negara Malaysia', description: 'The official national archives portal providing digitized historical files, national declarations, and independence journals for school history reports.', url: 'http://www.arkib.gov.my/', category: 'Databases & Research', audience: 'Secondary', language: 'Bahasa Melayu' },

    // --- Quiz Platforms ---
    { id: 'wordwall-bm-quiz', title: 'Wordwall BM Bahasa Melayu Quizzes', description: 'Thousands of free, colorful school quizzes, spelling wheels, and grammar pairing competitions designed by Malaysian educators for BM syntax mastery.', url: 'https://wordwall.net/', category: 'Quiz Platforms', audience: 'Primary', language: 'Bahasa Melayu', trending: true },
    { id: 'kahoot-bm-grammar', title: 'Kahoot! Peraduan Tatabahasa Melayu', description: 'Interactive classroom matches focusing on proper BM sentence structure, active/passive voice, and classical literature vocabulary tests.', url: 'https://kahoot.com/subject/bahasa-melayu/', category: 'Quiz Platforms', audience: 'All', language: 'Bahasa Melayu' },
    { id: 'quizizz-bm-kssr', title: 'Quizizz BM KSSR Latihan Tatabahasa', description: 'Custom quiz sets mirroring the national school syllabus, enabling students to practice grammar, pronouns (kata ganti nama), and idioms (simpulan bahasa).', url: 'https://quizizz.com/subject/bahasa-melayu', category: 'Quiz Platforms', audience: 'All', language: 'Bahasa Melayu', recommended: true },
    { id: 'edpuzzle-bm-kurikulum', title: 'Edpuzzle BM Video Kuiz Interaktif', description: 'Educational video segments accompanied by embedded open-ended questions and checks on vocabulary, history, and moral choices in Malay.', url: 'https://edpuzzle.com/', category: 'Quiz Platforms', audience: 'Secondary', language: 'Bahasa Melayu' },

    // --- Interactive Games ---
    { id: 'shego-bm-grammar', title: 'Shego Interactive BM Grammar Games', description: 'Fun interactive Bahasa Melayu grammar, suffix (imbuhan), and vocabulary board-like games suited for primary school syllabus revisions.', url: 'https://www.shegolearning.com/', category: 'Interactive Games', audience: 'Primary', language: 'Bahasa Melayu' },
    { id: 'bm-teka-silang-kata', title: 'Permainan Teka Silang Kata BM', description: 'Engaging, digital crossword puzzle game which tests kids\' vocabulary, spelling, and synonym knowledge of modern Bahasa Melayu.', url: 'https://wordwall.net/community/bm/teka-silang-kata', category: 'Interactive Games', audience: 'All', language: 'Bahasa Melayu', trending: true },
    { id: 'e-belajar-game-kpm', title: 'KPM E-Belajar Interactive Play', description: 'Learning mini-games designed under Ministry guidelines, combining mathematics, sciences, and history with gamified rewards for elementary kids.', url: 'https://pautan.kpgr.gov.my/', category: 'Interactive Games', audience: 'Primary', language: 'Bahasa Melayu' },
    { id: 'bm-kosa-kata-interaktif', title: 'Kosa Kata Interaktif Pintar', description: 'Spelling challenges, animal naming cards, and matching puzzles created to build secondary or primary language skills in a playful format.', url: 'https://www.educandy.com/', category: 'Interactive Games', audience: 'Primary', language: 'Bahasa Melayu' },

    // --- Assessment Tools ---
    { id: 'sistemguruonline-tests', title: 'Sistem Guru Online Assessment Bank', description: 'Highly structured formative PDF worksheets, mock test papers, and curricular evaluations compliant with national primary KSSR / KSSM secondary standards.', url: 'https://www.sistemguruonline.my/', category: 'Assessment Tools', audience: 'All', language: 'Bahasa Melayu' },
    { id: 'bank-soalan-spm', title: 'Bank Soalan SPM & PT3 Nasional', description: 'An outstanding database of past-year national trial exam papers, answer keys, and diagnostic grading sheets compiled for secondary students.', url: 'https://banksoalan.online/', category: 'Assessment Tools', audience: 'Secondary', language: 'Bahasa Melayu', trending: true },
    { id: 'saps-nkra-mock-portal', title: 'SAPS Ibu Bapa Analisis Ujian', description: 'School performance reporting dashboard supplying parents and students with a historical breakdown of mid-year, final, and trial exam scores.', url: 'https://sapsnkra.com.my/', category: 'Assessment Tools', audience: 'All', language: 'Bahasa Melayu' },
    { id: 'pendidik-my-assessment', title: 'Portal Pendidik Akademik Ujian', description: 'Online resource presenting diagnostic checklists, lesson assessments, and printable worksheets for secondary level science, BM, and history.', url: 'https://www.pendidik.my/', category: 'Assessment Tools', audience: 'Secondary', language: 'Bahasa Melayu' },

    // --- Subject Learning ---
    { id: 'didiktv-kpm', title: 'Didik TV KPM (Kementerian Pendidikan)', description: 'Educational classroom video productions by the Ministry of Education Malaysia covering core high school subjects (Sains, Sejarah, Matematik) in Bahasa Melayu.', url: 'https://www.ntv7.com.my/didiktv', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu', recommended: true },
    { id: 'portal-delima-kpm', title: 'DELIMa KPM Digital Learning', description: 'The official single-sign-on digital learning platform by the Ministry of Education, housing Google Classroom tools, school books, and interactive videos.', url: 'https://sites.google.com/moe.edu.my/login/delima-kpm', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu', recommended: true, trending: true },
    { id: 'cikgu-tube-moe', title: 'CikguTube Portal Video Pembelajaran', description: 'Video repository featuring structured virtual classes, mathematics tips, and experiments narrated by creative Malaysian public school teachers.', url: 'https://cikgutube.moe-dl.edu.my/', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu' },
    { id: 'astro-tutor-tv', title: 'Astro Tutor TV SPM & UPSR Portal', description: 'Educational broadcast portal containing dynamic revision videos, question walkthroughs, and tip segments for primary and secondary exam revisions.', url: 'http://www.astrotutortv.com.my/', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu', trending: true },
    { id: 'akademiyoutuber-my', title: 'Akademi Youtuber Malaysia (AYU)', description: 'A massive community-driven portal hosting free live tuition streams, school-aligned lesson playlists, and virtual badges led by certified local educators.', url: 'https://www.akademiyoutuber.com/', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu', recommended: true },
    { id: 'cikgusains-bm-notes', title: 'Cikgu Sains BM Notes Support', description: 'Curated scientific diagrams, experiments notes, and physics guidelines compiled in native Malay to make elementary and high school sciences simple.', url: 'https://cikgusains.com/', category: 'Subject Learning', audience: 'All', language: 'Bahasa Melayu' },
  ];

  const languages: ('All' | 'English' | 'Chinese / Mandarin' | 'Bahasa Melayu')[] = [
    'All', 
    'English', 
    'Chinese / Mandarin', 
    'Bahasa Melayu'
  ];

  const categories = [
    'All',
    'E-Books',
    'Databases & Research',
    'Quiz Platforms',
    'Interactive Games',
    'Assessment Tools',
    'Subject Learning'
  ];

  const filtered = resources.filter(res => {
    const matchesAudience = activeAudience === 'All' || res.audience === activeAudience || res.audience === 'All';
    const matchesLanguage = activeLanguage === 'All' || res.language === activeLanguage;
    const matchesCategory = activeCategory === 'All' || res.category === activeCategory;
    const matchesSearch = res.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          res.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          res.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAudience && matchesLanguage && matchesCategory && matchesSearch;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedResources = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getLanguageBadge = (lang: string) => {
    switch (lang) {
      case 'English': return '🇬🇧 English';
      case 'Chinese / Mandarin': return '🇨🇳 Mandarin';
      case 'Bahasa Melayu': return '🇲🇾 Bahasa Melayu';
      default: return lang;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-natural-border">
        <div>
          <h2 className="text-3xl font-serif font-black text-zera-emerald">School Digital Gateway</h2>
          <p className="text-natural-muted font-medium">Curated, safe eBooks, databases, quizzes, interactive games, assessments, and subjects for students.</p>
        </div>
        <div className="flex flex-wrap shrink-0 bg-white p-1 rounded-2xl border border-natural-border shadow-sm">
          {['All', 'Primary', 'Secondary'].map((aud) => (
            <button
              key={aud}
              onClick={() => setActiveAudience(aud as any)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                activeAudience === aud ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
              )}
            >
              {aud === 'All' ? 'All Grades' : aud}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <form onSubmit={(e) => e.preventDefault()} className="relative col-span-1 md:col-span-2 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-yellow transition-colors" />
          <input 
            type="text"
            placeholder="Search school resources, quizzes, games..."
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
            <p className="text-sm font-bold text-natural-text">Quizizz Games</p>
          </div>
        </div>
        <div className="bg-zera-emerald/5 border border-zera-emerald/10 p-4 rounded-3xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-zera-emerald/10 flex items-center justify-center">
            <Star className="w-5 h-5 text-zera-emerald" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zera-emerald uppercase tracking-widest leading-none mb-1">Weekly Pick</p>
            <p className="text-sm font-bold text-natural-text">Oxford Owl Library</p>
          </div>
        </div>
      </div>

      {/* Language filter row */}
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-zera-emerald block mb-2">Display Languages</label>
          <div className="flex gap-2 p-1 bg-natural-border/20 rounded-2xl overflow-x-auto no-scrollbar max-w-max">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLanguage(lang)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                  activeLanguage === lang ? "bg-white text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
                )}
              >
                {lang === 'All' ? 'All Languages' : lang}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter row */}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-zera-emerald block mb-2">Digital Resource Categories</label>
          <div className="flex gap-2 p-1 bg-natural-border/20 rounded-2xl overflow-x-auto no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap",
                  activeCategory === cat ? "bg-zera-emerald text-white shadow-sm" : "bg-white text-natural-muted border border-natural-border hover:text-zera-emerald"
                )}
              >
                {cat !== 'All' && CATEGORY_ICONS[cat]}
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedResources.map((res) => (
          <div key={res.id} className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col group h-full relative overflow-hidden">
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-zera-emerald/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 duration-700" />
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex gap-1.5 flex-wrap">
                <div className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border", 
                  res.audience === 'Primary' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                  res.audience === 'Secondary' ? 'bg-teal-50 text-teal-600 border-teal-100' : 'bg-natural-bg text-natural-muted border-natural-border'
                )}>
                  {res.audience === 'All' ? 'All Grades' : res.audience}
                </div>
                <div className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-emerald-50 text-emerald-600 border-emerald-100">
                  {getLanguageBadge(res.language)}
                </div>
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-8 px-6 py-4 bg-white border border-natural-border rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
          <span className="text-[10px] font-black uppercase tracking-wider text-natural-muted">
            Showing <span className="font-bold text-zera-emerald">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="font-bold text-zera-emerald">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-bold text-zera-emerald">{filtered.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-natural-border text-[9px] font-black uppercase tracking-widest hover:bg-natural-bg disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-7 h-7 rounded-lg text-[9px] font-black transition-all cursor-pointer",
                      currentPage === pageNum 
                        ? "bg-zera-emerald text-white shadow-sm" 
                        : "text-natural-muted hover:bg-natural-bg"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-natural-border text-[9px] font-black uppercase tracking-widest hover:bg-natural-bg disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-natural-border">
          <div className="w-16 h-16 bg-natural-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-natural-muted opacity-30" />
          </div>
          <p className="text-natural-muted font-serif italic text-lg capitalize">No school resources found matching your filters.</p>
          <button 
            onClick={() => { setSearchTerm(''); setActiveLanguage('All'); setActiveCategory('All'); setActiveAudience('All'); }}
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

