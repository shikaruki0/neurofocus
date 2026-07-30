/**
 * NCERT syllabus packs.
 *
 * Class 10 India mode is intentionally locked to NCERT-only books/chapters.
 * The app uses these records to show subject → chapter → lectures remaining,
 * so students do not have to manually create their syllabus.
 */

import type { SecondLanguageChoice, StudentProfile } from './student.ts';

export type NcertClass10SubjectKey =
  | 'Math'
  | 'Physics'
  | 'Chemistry'
  | 'Biology'
  | 'History'
  | 'Geography'
  | 'Political Science'
  | 'Economics'
  | 'English'
  | 'Hindi Course A'
  | 'Hindi Course B'
  | 'Sanskrit'
  | 'Urdu';

export interface NcertChapter {
  id: string;
  classLevel: 10;
  country: 'India';
  board: 'NCERT';
  subjectKey: NcertClass10SubjectKey;
  subjectLabel: string;
  bookId: string;
  bookName: string;
  unitName?: string;
  chapterNumber: string;
  title: string;
}

export interface NcertSubjectOption {
  key: NcertClass10SubjectKey;
  label: string;
  chapters: NcertChapter[];
}

const base = (
  subjectKey: NcertClass10SubjectKey,
  subjectLabel: string,
  bookId: string,
  bookName: string,
  chapterNumber: string,
  title: string,
  unitName?: string,
): NcertChapter => ({
  id: `${bookId}-${String(chapterNumber)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`,
  classLevel: 10,
  country: 'India',
  board: 'NCERT',
  subjectKey,
  subjectLabel,
  bookId,
  bookName,
  unitName,
  chapterNumber,
  title,
});

const math = [
  'Real Numbers',
  'Polynomials',
  'Pair of Linear Equations in Two Variables',
  'Quadratic Equations',
  'Arithmetic Progressions',
  'Triangles',
  'Coordinate Geometry',
  'Introduction to Trigonometry',
  'Some Applications of Trigonometry',
  'Circles',
  'Areas Related to Circles',
  'Surface Areas and Volumes',
  'Statistics',
  'Probability',
].map((title, i) =>
  base('Math', 'Mathematics', 'ncert10-math', 'Mathematics', String(i + 1), title),
);

const science = [
  base(
    'Chemistry',
    'Chemistry',
    'ncert10-science',
    'Science',
    '1',
    'Chemical Reactions and Equations',
    'Chemistry',
  ),
  base(
    'Chemistry',
    'Chemistry',
    'ncert10-science',
    'Science',
    '2',
    'Acids, Bases and Salts',
    'Chemistry',
  ),
  base(
    'Chemistry',
    'Chemistry',
    'ncert10-science',
    'Science',
    '3',
    'Metals and Non-metals',
    'Chemistry',
  ),
  base(
    'Chemistry',
    'Chemistry',
    'ncert10-science',
    'Science',
    '4',
    'Carbon and its Compounds',
    'Chemistry',
  ),
  base('Biology', 'Biology', 'ncert10-science', 'Science', '5', 'Life Processes', 'Biology'),
  base(
    'Biology',
    'Biology',
    'ncert10-science',
    'Science',
    '6',
    'Control and Coordination',
    'Biology',
  ),
  base(
    'Biology',
    'Biology',
    'ncert10-science',
    'Science',
    '7',
    'How do Organisms Reproduce?',
    'Biology',
  ),
  base('Biology', 'Biology', 'ncert10-science', 'Science', '8', 'Heredity', 'Biology'),
  base(
    'Physics',
    'Physics',
    'ncert10-science',
    'Science',
    '9',
    'Light — Reflection and Refraction',
    'Physics',
  ),
  base(
    'Physics',
    'Physics',
    'ncert10-science',
    'Science',
    '10',
    'The Human Eye and the Colourful World',
    'Physics',
  ),
  base('Physics', 'Physics', 'ncert10-science', 'Science', '11', 'Electricity', 'Physics'),
  base(
    'Physics',
    'Physics',
    'ncert10-science',
    'Science',
    '12',
    'Magnetic Effects of Electric Current',
    'Physics',
  ),
  base(
    'Biology',
    'Biology',
    'ncert10-science',
    'Science',
    '13',
    'Our Environment',
    'Biology / Environment',
  ),
];

const socialScience = [
  base(
    'History',
    'History',
    'ncert10-history',
    'India and the Contemporary World-II',
    '1',
    'The Rise of Nationalism in Europe',
  ),
  base(
    'History',
    'History',
    'ncert10-history',
    'India and the Contemporary World-II',
    '2',
    'Nationalism in India',
  ),
  base(
    'History',
    'History',
    'ncert10-history',
    'India and the Contemporary World-II',
    '3',
    'The Making of a Global World',
  ),
  base(
    'History',
    'History',
    'ncert10-history',
    'India and the Contemporary World-II',
    '4',
    'The Age of Industrialisation',
  ),
  base(
    'History',
    'History',
    'ncert10-history',
    'India and the Contemporary World-II',
    '5',
    'Print Culture and the Modern World',
  ),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '1',
    'Resources and Development',
  ),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '2',
    'Forest and Wildlife Resources',
  ),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '3',
    'Water Resources',
  ),
  base('Geography', 'Geography', 'ncert10-geography', 'Contemporary India-II', '4', 'Agriculture'),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '5',
    'Minerals and Energy Resources',
  ),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '6',
    'Manufacturing Industries',
  ),
  base(
    'Geography',
    'Geography',
    'ncert10-geography',
    'Contemporary India-II',
    '7',
    'Lifelines of National Economy',
  ),
  base(
    'Political Science',
    'Political Science',
    'ncert10-civics',
    'Democratic Politics-II',
    '1',
    'Power-sharing',
  ),
  base(
    'Political Science',
    'Political Science',
    'ncert10-civics',
    'Democratic Politics-II',
    '2',
    'Federalism',
  ),
  base(
    'Political Science',
    'Political Science',
    'ncert10-civics',
    'Democratic Politics-II',
    '3',
    'Gender, Religion and Caste',
  ),
  base(
    'Political Science',
    'Political Science',
    'ncert10-civics',
    'Democratic Politics-II',
    '4',
    'Political Parties',
  ),
  base(
    'Political Science',
    'Political Science',
    'ncert10-civics',
    'Democratic Politics-II',
    '5',
    'Outcomes of Democracy',
  ),
  base(
    'Economics',
    'Economics',
    'ncert10-economics',
    'Understanding Economic Development',
    '1',
    'Development',
  ),
  base(
    'Economics',
    'Economics',
    'ncert10-economics',
    'Understanding Economic Development',
    '2',
    'Sectors of the Indian Economy',
  ),
  base(
    'Economics',
    'Economics',
    'ncert10-economics',
    'Understanding Economic Development',
    '3',
    'Money and Credit',
  ),
  base(
    'Economics',
    'Economics',
    'ncert10-economics',
    'Understanding Economic Development',
    '4',
    'Globalisation and the Indian Economy',
  ),
  base(
    'Economics',
    'Economics',
    'ncert10-economics',
    'Understanding Economic Development',
    '5',
    'Consumer Rights',
  ),
];

const englishFirstFlight = [
  ['Prose 1', 'A Letter to God'],
  ['Poem 1', 'Dust of Snow'],
  ['Poem 2', 'Fire and Ice'],
  ['Prose 2', 'Nelson Mandela: Long Walk to Freedom'],
  ['Poem 3', 'A Tiger in the Zoo'],
  ['Prose 3', 'Two Stories about Flying'],
  ['Poem 4', 'How to Tell Wild Animals'],
  ['Poem 5', 'The Ball Poem'],
  ['Prose 4', 'From the Diary of Anne Frank'],
  ['Poem 6', 'Amanda!'],
  ['Prose 5', 'Glimpses of India'],
  ['Poem 7', 'The Trees'],
  ['Prose 6', 'Mijbil the Otter'],
  ['Poem 8', 'Fog'],
  ['Prose 7', 'Madam Rides the Bus'],
  ['Poem 9', 'The Tale of Custard the Dragon'],
  ['Prose 8', 'The Sermon at Benares'],
  ['Poem 10', 'For Anne Gregory'],
  ['Prose 9', 'The Proposal'],
].map(([num, title]) =>
  base('English', 'English', 'ncert10-first-flight', 'First Flight', num, title),
);

const englishFootprints = [
  'A Triumph of Surgery',
  "The Thief's Story",
  'The Midnight Visitor',
  'A Question of Trust',
  'Footprints without Feet',
  'The Making of a Scientist',
  'The Necklace',
  'Bholi',
  'The Book That Saved the Earth',
].map((title, i) =>
  base('English', 'English', 'ncert10-footprints', 'Footprints without Feet', String(i + 1), title),
);

const englishWorkbook = Array.from({ length: 8 }, (_, i) =>
  base(
    'English',
    'English',
    'ncert10-words-expressions',
    'Words and Expressions-II',
    `Unit ${i + 1}`,
    `Unit ${i + 1}`,
  ),
);

const hindiCourseA = [
  ['1', 'सूरदास — पद'],
  ['2', 'तुलसीदास — राम-लक्ष्मण-परशुराम संवाद'],
  ['3', 'जयशंकर प्रसाद — आत्मकथ्य'],
  ['4', 'सूर्यकांत त्रिपाठी “निराला” — उत्साह / अट नहीं रही है'],
  ['5', 'नागार्जुन — यह दंतुरित मुस्कान / फसल'],
  ['6', 'मंगलेश डबराल — संगतकार'],
  ['7', 'स्वयं प्रकाश — नेताजी का चश्मा'],
  ['8', 'रामवृक्ष बेनीपुरी — बालगोबिन भगत'],
  ['9', 'यशपाल — लखनवी अंदाज़'],
  ['10', 'मन्नू भंडारी — एक कहानी यह भी'],
  ['11', 'यतीन्द्र मिश्र — नौबतखाने में इबादत'],
  ['12', 'भदंत आनंद कौसल्यायन — संस्कृति'],
].map(([num, title]) =>
  base('Hindi Course A', 'Hindi Course A', 'ncert10-kshitij', 'Kshitij-2', num, title),
);

const kritika = [
  ['1', 'माता का अँचल'],
  ['2', 'जॉर्ज पंचम की नाक'],
  ['3', 'साना-साना हाथ जोड़ि...'],
].map(([num, title]) =>
  base('Hindi Course A', 'Hindi Course A', 'ncert10-kritika', 'Kritika', num, title),
);

const hindiCourseB = [
  ['कविता 1', 'कबीर — साखी'],
  ['कविता 2', 'मीरा — पद'],
  ['कविता 3', 'मैथिलीशरण गुप्त — मनुष्यता'],
  ['कविता 4', 'सुमित्रानंदन पंत — पर्वत प्रदेश में पावस'],
  ['कविता 5', 'महादेवी वर्मा — मधुर-मधुर मेरे दीपक जल'],
  ['कविता 6', 'वीरेन डंगवाल — तोप'],
  ['कविता 7', 'कैफ़ी आज़मी — कर चले हम फ़िदा'],
  ['8', 'प्रेमचंद — बड़े भाई साहब'],
  ['9', 'सीताराम सेकसरिया — डायरी का एक पन्ना'],
  ['10', 'लीलाधर मंडलोई — तताँरा-वामीरो कथा'],
  ['11', 'प्रह्लाद अग्रवाल — तीसरी कसम के शिल्पकार शैलेंद्र'],
  ['12', 'अंतोन चेखव — गिरगिट'],
  ['13', 'निदा फ़ाज़ली — अब कहाँ दूसरे के दुख से दुखी होने वाले'],
  ['14', 'हबीब तनवीर — कारतूस'],
].map(([num, title]) =>
  base('Hindi Course B', 'Hindi Course B', 'ncert10-sparsh', 'Sparsh', num, title),
);

const sanchayan = [
  ['1', 'हरिहर काका'],
  ['2', 'सपनों के-से दिन'],
  ['3', 'टोपी शुक्ला'],
].map(([num, title]) =>
  base('Hindi Course B', 'Hindi Course B', 'ncert10-sanchayan', 'Sanchayan Bhag-2', num, title),
);

const sanskrit = [
  ['1', 'शुचिपर्यावरणम्'],
  ['2', 'बुद्धिर्बलवती सदा'],
  ['3', 'शिशुलालनम्'],
  ['4', 'जननी तुल्यवत्सला'],
  ['5', 'सुभाषितानि'],
  ['6', 'सौहार्दं प्रकृतेः शोभा'],
  ['7', 'विचित्रः साक्षी'],
  ['8', 'सूक्तयः'],
  ['9', 'भूकम्पविभीषिका'],
  ['10', 'प्राणेभ्योऽपि प्रियः सुहृद्'],
  ['11', 'अन्योक्तयः'],
  ['12', 'कः रक्षति कः रक्षितः'],
].map(([num, title]) => base('Sanskrit', 'Sanskrit', 'ncert10-shemushi', 'Shemushi', num, title));

const sanskritPractice = Array.from({ length: 14 }, (_, i) =>
  base(
    'Sanskrit',
    'Sanskrit',
    'ncert10-abhyaswaan-bhav',
    'Abhyaswaan Bhav-II',
    String(i + 1),
    `Abhyaswaan Bhav-II — Chapter ${i + 1}`,
  ),
);

const urdu = [
  'Urdu NCERT Book — Chapter 1',
  'Urdu NCERT Book — Chapter 2',
  'Urdu NCERT Book — Chapter 3',
  'Urdu NCERT Book — Chapter 4',
  'Urdu NCERT Book — Chapter 5',
].map((title, i) => base('Urdu', 'Urdu', 'ncert10-urdu', 'Urdu NCERT', String(i + 1), title));

export const NCERT_CLASS_10_CORE_CHAPTERS: NcertChapter[] = [
  ...math,
  ...science,
  ...socialScience,
  ...englishFirstFlight,
  ...englishFootprints,
  ...englishWorkbook,
];

export function getSecondLanguageChapters(choice: SecondLanguageChoice): NcertChapter[] {
  switch (choice) {
    case 'hindi-a':
      return [...hindiCourseA, ...kritika];
    case 'hindi-b':
      return [...hindiCourseB, ...sanchayan];
    case 'sanskrit':
      return [...sanskrit, ...sanskritPractice];
    case 'urdu':
      return urdu;
    default:
      return [];
  }
}

export function getClass10NcertChapters(
  secondLanguage: SecondLanguageChoice = 'hindi-b',
): NcertChapter[] {
  return [...NCERT_CLASS_10_CORE_CHAPTERS, ...getSecondLanguageChapters(secondLanguage)];
}

export function isIndiaClass10Profile(profile: StudentProfile | null | undefined): boolean {
  if (!profile) return false;
  return profile.country.trim().toLowerCase() === 'india' && Number(profile.classLevel) === 10;
}

export function getChaptersForProfile(profile: StudentProfile | null | undefined): NcertChapter[] {
  if (!isIndiaClass10Profile(profile)) return [];
  return getClass10NcertChapters(profile?.secondLanguage || 'hindi-b');
}

export function getSubjectOptionsForProfile(
  profile: StudentProfile | null | undefined,
): NcertSubjectOption[] {
  const chapters = getChaptersForProfile(profile);
  const order: NcertClass10SubjectKey[] = [
    'Math',
    'Physics',
    'Chemistry',
    'Biology',
    'History',
    'Geography',
    'Political Science',
    'Economics',
    'English',
    'Hindi Course A',
    'Hindi Course B',
    'Sanskrit',
    'Urdu',
  ];

  return order
    .map((key) => {
      const grouped = chapters.filter((chapter) => chapter.subjectKey === key);
      if (!grouped.length) return null;
      return {
        key,
        label: grouped[0].subjectLabel,
        chapters: grouped,
      } satisfies NcertSubjectOption;
    })
    .filter((item): item is NcertSubjectOption => Boolean(item));
}

export function findNcertChapter(
  chapterId: string,
  profile: StudentProfile | null | undefined,
): NcertChapter | null {
  return getChaptersForProfile(profile).find((chapter) => chapter.id === chapterId) || null;
}

export function makeUnassignedChapter(subjectKey: string, subjectLabel = subjectKey): NcertChapter {
  return {
    id: `unassigned-${subjectKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    classLevel: 10,
    country: 'India',
    board: 'NCERT',
    subjectKey: subjectKey as NcertClass10SubjectKey,
    subjectLabel,
    bookId: 'ncert10-unassigned',
    bookName: 'Unassigned NCERT backlog',
    unitName: subjectLabel,
    chapterNumber: 'Not sure',
    title: 'Not sure yet',
  };
}

export function formatChapterOptionLabel(chapter: NcertChapter): string {
  const prefix = chapter.bookName ? `${chapter.bookName} — ` : '';
  return `${prefix}${chapter.chapterNumber}. ${chapter.title}`;
}
