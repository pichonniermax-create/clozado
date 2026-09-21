import { RESERVATION_EN_LIGNE } from "./site-config";

/**
 * LA PHRASE QUI N'EST VRAIE QUE SI LE BOUTON EXISTE.
 *
 * Six pages finissent par « … Pour en parler, réservez un créneau. » Tant
 * que la prise de rendez-vous n'est pas en ligne, cette phrase promet un
 * geste que la page ne propose pas — et un site qui promet ce qu'il ne fait
 * pas se décrédibilise plus vite qu'il ne convainc.
 *
 * Les contenus gardent donc DEUX morceaux : ce qui est vrai toujours, et ce
 * qui ne l'est que le jour où le bouton revient. Cette fonction les recolle
 * — ou non.
 */
export function avecReservation(texte: string, phrase?: string): string {
  return RESERVATION_EN_LIGNE && phrase ? `${texte} ${phrase}` : texte;
}
