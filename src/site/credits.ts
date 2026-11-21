// Photo credits for the static example photos in public/img (Wikimedia Commons). The footer renders this list.
// The photos show a property type, not the addresses named beside them, and the page says so.
export interface PhotoCredit {
  /** File in public/img, without the folder. */
  file: string;
  /** What the photo shows, as the footer names it. */
  label: string;
  author: string;
  licence: string;
  /** The Commons file page. */
  href: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    file: "house.jpg",
    label: "Townhouse",
    author: "PinkAechFas",
    licence: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Townhouses_in_Victoria_Australia.jpg",
  },
  {
    file: "flat.jpg",
    label: "Docklands",
    author: "Rexness",
    licence: "CC BY-SA 2.0",
    href: "https://commons.wikimedia.org/wiki/File:New_Quay_Apartment_Buildings,_Docklands,_Melbourne_Australia_(4587399061).jpg",
  },
  {
    file: "investor.jpg",
    label: "Terraces",
    author: "Nick carson at English Wikipedia",
    licence: "Public domain",
    href: "https://commons.wikimedia.org/wiki/File:Late_Victorian_%22Melbourne_Style%22_terraces.jpg",
  },
  {
    file: "agent.jpg",
    label: "House",
    author: "Philip Mallis",
    licence: "CC BY-SA 2.0",
    href: "https://commons.wikimedia.org/wiki/File:House_on_suburban_street_in_Sunshine,_Victoria.jpg",
  },
  {
    file: "short.jpg",
    label: "Living room",
    author: "Shixart1985",
    licence: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:Modern_living_room_with_stylish_furniture_and_a_view_of_the_outdoors_in_a_cozy_apartment_setting.jpg",
  },
  {
    file: "home.jpg",
    label: "Cottage",
    author: "Robert Merkel",
    licence: "Public domain",
    href: "https://commons.wikimedia.org/wiki/File:Workers_cottage.jpg",
  },
];

export const CREDITS_INTRO = "Example photos from Wikimedia Commons, not the addresses shown.";
