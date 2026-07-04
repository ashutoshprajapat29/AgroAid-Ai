import { useEffect } from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { motion } from 'motion/react';
import FieldManager from '../components/FieldManager';

export default function FieldsPage() {
  const { t } = useLanguage();
  useEffect(() => { document.title = t('seo.fields.title'); }, [t]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full overflow-y-auto p-3 md:p-6"
    >
      <FieldManager />
    </motion.div>
  );
}
