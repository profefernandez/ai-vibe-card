import { motion } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";

const BookingSection = () => (
  <motion.section
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.6, duration: 0.5 }}
    className="px-6 pb-6"
  >
    <a
      href="https://calendly.com"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between w-full px-6 py-5 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-opacity glow-amber"
    >
      <span className="flex items-center gap-3">
        <Calendar className="w-5 h-5" />
        Book a Free Discovery Call
      </span>
      <ArrowRight className="w-4 h-4" />
    </a>
  </motion.section>
);

export default BookingSection;
