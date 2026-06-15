#!/bin/bash
# Upload all technical documents to S3 and output SQL INSERT statements

# Documents to upload (excluding templates, images, spreadsheets, and the already-seeded MAN-2012)
declare -A DOCS

# RB100 Engineering Documents
DOCS["/home/ubuntu/upload/1.-Cranked-Post.pdf"]="Cranked Post Detail|RB100-01|Cranked post engineering detail"
DOCS["/home/ubuntu/upload/1b.-90-Degree-Cranked-Post-Detail.pdf"]="90 Degree Cranked Post Detail|RB100-01b|90 degree cranked post engineering detail"
DOCS["/home/ubuntu/upload/2.-Beam-Splice.pdf"]="Beam Splice|RB100-02|Beam splice engineering detail"
DOCS["/home/ubuntu/upload/3.-Anchor-Capacity-of-Brickwork.pdf"]="Anchor Capacity of Brickwork|RB100-03|Anchor capacity specifications for brickwork"
DOCS["/home/ubuntu/upload/4.-Aluminium-Post-Connector.pdf"]="Aluminium Post Connector|RB100-04|Aluminium post connector specifications"
DOCS["/home/ubuntu/upload/4.-RB102.pdf"]="RB102 Engineering Data|RB102|RB102 engineering reference data"
DOCS["/home/ubuntu/upload/5.-Back-to-Back-Backchannels.pdf"]="Back to Back Backchannels|RB100-05|Back to back backchannel engineering detail"
DOCS["/home/ubuntu/upload/6.-G1-Aluminium-Ridge-Extrusion-Connector.pdf"]="G1 Aluminium Ridge Extrusion Connector|RB100-06|G1 aluminium ridge extrusion connector detail"
DOCS["/home/ubuntu/upload/6.-G2.pdf"]="G2 Engineering Data|RB100-G2|G2 engineering reference data"
DOCS["/home/ubuntu/upload/7.-G2-Aluminium-Ridge-Extrusion-Connector.pdf"]="G2 Aluminium Ridge Extrusion Connector|RB100-07|G2 aluminium ridge extrusion connector detail"
DOCS["/home/ubuntu/upload/8.-Rafter-Stengthening.pdf"]="Rafter Strengthening|RB100-08|Rafter strengthening engineering detail"
DOCS["/home/ubuntu/upload/9.-SFS01.pdf"]="SFS01 Steel Framing System|RB100-SFS01|SFS01 steel framing system specifications"
DOCS["/home/ubuntu/upload/10.FSS01.pdf"]="FSS01 Free Standing System|RB100-FSS01|FSS01 free standing system specifications"
DOCS["/home/ubuntu/upload/11.-FSS02.pdf"]="FSS02 Free Standing System|RB100-FSS02|FSS02 free standing system specifications"
DOCS["/home/ubuntu/upload/11.-Slendek-Slenlites.pdf"]="Slendek Slenlites|RB100-11|Slendek and Slenlites product specifications"
DOCS["/home/ubuntu/upload/12.-Box-Gutter-Carports.pdf"]="Box Gutter Carports|RB100-12|Box gutter carport engineering detail"
DOCS["/home/ubuntu/upload/12.-RHS.pdf"]="RHS Engineering Data|RB100-RHS|RHS (Rectangular Hollow Section) engineering data"
DOCS["/home/ubuntu/upload/13.-Aluminium-Box-Beam-Span.pdf"]="Aluminium Box Beam Span|RB100-13|Aluminium box beam span tables and specifications"
DOCS["/home/ubuntu/upload/13.-Enclosed-Structures-2-unprotected.pdf"]="Enclosed Structures (Unprotected)|RB100-13E|Enclosed structures engineering data (unprotected)"
DOCS["/home/ubuntu/upload/13.-Slab-Design.pdf"]="Slab Design|RB100-13S|Slab design engineering specifications"
DOCS["/home/ubuntu/upload/14.-Point-Load-Beams.pdf"]="Point Load Beams|RB100-14|Point load beam engineering data"
DOCS["/home/ubuntu/upload/14.-Roof-Extenda-Brackets.pdf"]="Roof Extenda Brackets|RB100-14E|Roof extenda bracket specifications"
DOCS["/home/ubuntu/upload/16.-AB104-Spec-Sheets.pdf"]="AB104 Spec Sheets|AB104|AB104 product specification sheets"
DOCS["/home/ubuntu/upload/16h.-Technical-Advice-and-Specifications-Roofsheet-Details-Double-U-Drawing-.pdf"]="Roofsheet Details Double U Drawing|TECH-16H|Technical advice and specifications for roofsheet details"
DOCS["/home/ubuntu/upload/18.-Insulroof-Spans-Data-For-Queenslands.pdf"]="Insulroof Spans Data (QLD)|RB100-18|Insulroof span data for Queensland"
DOCS["/home/ubuntu/upload/18.-Spanline-Bracketry.pdf"]="Spanline Bracketry|RB100-18B|Spanline bracketry specifications"
DOCS["/home/ubuntu/upload/19.-Corrolink-Spans-Data-For-New-South-Wales.pdf"]="Corrolink Spans Data (NSW)|RB100-19|Corrolink span data for New South Wales"

# Engineering Documents
DOCS["/home/ubuntu/upload/Engineering(SoilClassM).pdf"]="Engineering - Soil Class M|ENG-SOIL-M|Engineering specifications for Soil Class M"
DOCS["/home/ubuntu/upload/EngineeringSpecificationSheet.pdf"]="Engineering Specification Sheet|ENG-SPEC|Standard engineering specification sheet"
DOCS["/home/ubuntu/upload/Extenda_Bracket_Engineering.pdf"]="Extenda Bracket Engineering|ENG-EXTENDA|Extenda bracket engineering specifications"
DOCS["/home/ubuntu/upload/gablebracket.pdf"]="Gable Bracket|ENG-GABLE|Gable bracket engineering detail"

# Product Documents
DOCS["/home/ubuntu/upload/NEW-PRODUCT-SPOTLIGHT-Spanlites-Diffusersp-.pdf"]="Spanlites Diffuser Product Spotlight|PROD-SPANLITES|New product spotlight - Spanlites Diffuser"
DOCS["/home/ubuntu/upload/Solar-Panels-to-Ezi-Struct-Roof-Panels-Engineering-June-2023p.pdf"]="Solar Panels to Ezi-Struct Roof Panels|ENG-SOLAR|Solar panel installation on Ezi-Struct roof panels engineering (June 2023)"
DOCS["/home/ubuntu/upload/Versiclad-Roofing-Booklet-With-Cert-May-2023.pdf"]="Versiclad Roofing Booklet|PROD-VERSICLAD|Versiclad roofing product booklet with certification (May 2023)"

# Job-specific engineering (still useful as reference)
DOCS["/home/ubuntu/upload/Engineering-19MeakinStreet,TurossHeadNSW2537.pdf"]="Engineering - 19 Meakin St Tuross Head|ENG-SAMPLE-01|Sample engineering report - 19 Meakin Street, Tuross Head NSW"
DOCS["/home/ubuntu/upload/EngineeringsupportdocumentsPickett98500.pdf"]="Engineering Support Documents - Pickett|ENG-SAMPLE-02|Engineering support documents - Pickett job reference"

SQL_FILE="/tmp/tech_library_inserts.sql"
echo "" > "$SQL_FILE"

COUNT=0
for filepath in "${!DOCS[@]}"; do
  if [ ! -f "$filepath" ]; then
    echo "SKIP (not found): $filepath"
    continue
  fi
  
  IFS='|' read -r title code description <<< "${DOCS[$filepath]}"
  
  echo "Uploading: $title ($code)..."
  URL=$(manus-upload-file --webdev "$filepath" 2>/dev/null | grep -o 'https://[^ ]*')
  
  if [ -z "$URL" ]; then
    echo "  ERROR: Failed to get URL for $filepath"
    continue
  fi
  
  # Escape single quotes in title and description
  title_escaped="${title//\'/\'\'}"
  desc_escaped="${description//\'/\'\'}"
  
  echo "INSERT INTO tech_library_documents (title, code, description, url, active, createdAt, updatedAt) VALUES ('$title_escaped', '$code', '$desc_escaped', '$URL', 1, NOW(), NOW());" >> "$SQL_FILE"
  
  COUNT=$((COUNT + 1))
  echo "  OK: $title → $URL"
done

echo ""
echo "=== Upload complete: $COUNT documents ==="
echo "SQL file: $SQL_FILE"
