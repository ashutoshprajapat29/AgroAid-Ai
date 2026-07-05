import { useEffect } from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { motion } from 'motion/react';
import DiseaseScanner from '../components/DiseaseScanner';

export default function HealthPage() {
  const { t } = useLanguage();
  useEffect(() => { document.title = t('seo.health.title'); }, [t]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full overflow-y-auto p-3 md:p-6"
    >
      <DiseaseScanner />
    </motion.div>
  );
}
