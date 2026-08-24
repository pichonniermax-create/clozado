/**
 * Le fuseau du produit. La clientèle est française et le serveur (Vercel)
 * est en UTC : tout ce qui se lit ou se saisit comme une heure de la journée
 * — échéances des tâches, date d'une interaction, affichage des dates — est
 * rapporté à ce fuseau, jamais à celui du serveur. À revoir si le produit
 * s'internationalise (fuseau par organisation).
 */
export const PRODUCT_TIMEZONE = "Europe/Paris";
