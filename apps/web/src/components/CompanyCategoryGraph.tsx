'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { categorizeOrganization } from '@faro/core';

import { groupCompaniesByIndustry } from '@/lib/company-categories';
import type { CompanyIndustryGroup } from '@/lib/company-categories';

export interface CompanyCategoryDatum {
  contacts: number;
  href?: string;
  id: string;
  industry: string;
  name: string;
}

const metricOptions = {
  companies: {
    description: 'Company count',
    prompt: 'Where is the company portfolio concentrated?',
  },
  contacts: {
    description: 'Contact reach',
    prompt: 'Which categories connect you to the most people?',
  },
} as const;

type CategoryMetric = keyof typeof metricOptions;

export function CompanyCategoryGraph({ companies }: { companies: CompanyCategoryDatum[] }) {
  const categorizedCompanies = useMemo(
    () =>
      companies.map((company) => ({
        ...company,
        industry:
          company.industry === 'Other'
            ? categorizeOrganization({ name: company.name }).category
            : company.industry,
      })),
    [companies],
  );
  const groups = useMemo(
    () =>
      groupCompaniesByIndustry(
        categorizedCompanies,
        (company) => company.industry,
        (company) => company.contacts,
      ),
    [categorizedCompanies],
  );
  const [metric, setMetric] = useState<CategoryMetric>('companies');
  const [selectedIndustry, setSelectedIndustry] = useState(groups[0]?.industry ?? '');
  const activeGroup =
    groups.find((group) => group.industry === selectedIndustry) ?? groups[0] ?? null;
  const getValue = (group: CompanyIndustryGroup<CompanyCategoryDatum>) =>
    metric === 'companies' ? group.companyCount : group.contactCount;
  const maximum = Math.max(...groups.map(getValue), 1);

  if (!groups.length) {
    return (
      <section className="panel company-category" aria-labelledby="company-category-title">
        <div className="panel__header company-category__header">
          <div>
            <p className="eyebrow">Company categories</p>
            <h2 id="company-category-title">No company categories yet</h2>
            <p>Import organizations to see their best available company categories here.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel company-category" aria-labelledby="company-category-title">
      <div className="panel__header company-category__header">
        <div>
          <p className="eyebrow">Company categories</p>
          <h2 id="company-category-title">{metricOptions[metric].prompt}</h2>
          <p>Companies are grouped by the canonical category assigned during each data poll.</p>
        </div>
        <div className="company-category__switcher" aria-label="Choose category graph metric">
          {(Object.keys(metricOptions) as CategoryMetric[]).map((option) => (
            <button
              aria-pressed={metric === option}
              key={option}
              onClick={() => setMetric(option)}
              type="button"
            >
              {metricOptions[option].description}
            </button>
          ))}
        </div>
      </div>

      <div className="company-category__layout">
        <div className="company-category__chart-region">
          <div className="company-category__scale" aria-hidden="true">
            <span>{maximum}</span>
            <span>0</span>
          </div>
          <div className="company-category__scroll">
            <div
              aria-label={`${metricOptions[metric].description} by company category`}
              className="company-category__plot"
              role="group"
            >
              {groups.map((group) => {
                const value = getValue(group);
                const height = Math.max((value / maximum) * 100, value ? 6 : 0);
                const selected = group.industry === activeGroup?.industry;
                const valueLabel =
                  metric === 'companies'
                    ? `${value} ${value === 1 ? 'company' : 'companies'}`
                    : `${value} ${value === 1 ? 'contact' : 'contacts'}`;

                return (
                  <button
                    aria-label={`${group.industry}: ${valueLabel}`}
                    aria-pressed={selected}
                    className="company-category__column"
                    key={group.industry}
                    onClick={() => setSelectedIndustry(group.industry)}
                    type="button"
                  >
                    <strong>{value}</strong>
                    <span className="company-category__bar-track" aria-hidden="true">
                      <span className="company-category__bar" style={{ height: `${height}%` }} />
                    </span>
                    <span className="company-category__label">{group.industry}</span>
                    <small>
                      {group.companyCount} {group.companyCount === 1 ? 'company' : 'companies'}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {activeGroup ? (
          <aside className="company-category__detail" aria-live="polite">
            <p className="eyebrow">Selected category</p>
            <h3>{activeGroup.industry}</h3>
            <dl>
              <div>
                <dt>Companies</dt>
                <dd>{activeGroup.companyCount}</dd>
              </div>
              <div>
                <dt>Known contacts</dt>
                <dd>{activeGroup.contactCount}</dd>
              </div>
            </dl>
            <ul>
              {activeGroup.companies
                .slice()
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((company) => (
                  <li key={company.id}>
                    {company.href ? <Link href={company.href}>{company.name}</Link> : company.name}
                    <span>
                      {company.contacts} {company.contacts === 1 ? 'contact' : 'contacts'}
                    </span>
                  </li>
                ))}
            </ul>
          </aside>
        ) : null}
      </div>

      <p className="chart-summary">
        {groups.length} {groups.length === 1 ? 'category' : 'categories'} across{' '}
        {categorizedCompanies.length} {categorizedCompanies.length === 1 ? 'company' : 'companies'}.
        Select a bar to see the companies behind the total.
      </p>
    </section>
  );
}
