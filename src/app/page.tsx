import { GlobeExperience } from "@/components/globe/GlobeExperience";
import { DatasetProvider } from "@/components/data/DatasetProvider";
import { getPublicDataset } from "@/data/server/getPublicDataset";

export default async function Home() {
  // Cached ("use cache"), so the page still prerenders into a static shell.
  const { raw, version } = await getPublicDataset();
  return (
    <DatasetProvider raw={raw} version={version}>
      <GlobeExperience />
    </DatasetProvider>
  );
}
