UPDATE "Organization"
SET "industry" = CASE
  WHEN COALESCE("industry", '') ~* '(food|grocery|restaurant|agriculture|farm|beverage)' THEN 'Food'
  WHEN COALESCE("industry", '') ~* '(technology|software|data|digital|civic tech|tech)' THEN 'Technology'
  WHEN COALESCE("industry", '') ~* '(energy|climate|renewable|utility)' THEN 'Energy'
  WHEN COALESCE("industry", '') ~* '(financial|finance|bank|credit union|fintech)' THEN 'Financial Services'
  WHEN COALESCE("industry", '') ~* '(consumer|retail|apparel|outdoor|goods)' THEN 'Consumer Goods'
  WHEN COALESCE("industry", '') ~* '(education|learning|school|university)' THEN 'Education'
  WHEN COALESCE("industry", '') ~* '(transport|mobility|transit|logistics)' THEN 'Transportation'
  WHEN COALESCE("industry", '') ~* '(media|publishing|journalism|broadcast)' THEN 'Media'
  WHEN COALESCE("industry", '') ~* '(philanthrop|foundation|charit)' THEN 'Philanthropy'
  WHEN COALESCE("industry", '') ~* '(community|nonprofit|civic|development)' THEN 'Community Development'
  WHEN COALESCE("industry", '') ~* '(government|public sector|municipal)' THEN 'Government'
  WHEN COALESCE("industry", '') ~* '(professional|consulting|legal|accounting|agency)' THEN 'Professional Services'
  ELSE 'Other'
END;

ALTER TABLE "Organization"
ALTER COLUMN "industry" SET DEFAULT 'Other',
ALTER COLUMN "industry" SET NOT NULL;

CREATE INDEX "Organization_workspaceId_industry_idx"
ON "Organization"("workspaceId", "industry");
