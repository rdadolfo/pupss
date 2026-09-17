import os
import tempfile
import matplotlib
matplotlib.use('Agg') # Strictly enforces headless/server-safe mode
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from datetime import datetime

from django.template.loader import render_to_string
from django.template.exceptions import TemplateDoesNotExist
from django.conf import settings
from z3c.rml import rml2pdf

# 🎯 UPGRADED: Added graph_data parameter
def generate_rml_insight_report(top_entities, entity_type, instructor_summaries=None, graph_data=None):
    temp_files_to_cleanup = [] # Keep track of all generated images so we can delete them
    temp_chart_path = None
    
    logo_file_path = os.path.join(settings.BASE_DIR, 'pupss/static/img/pup.png').replace('\\', '/')
    font_file_path = os.path.join(settings.BASE_DIR, 'pupss/static/fonts/segoe-ui').replace('\\', '/')
    current_time = datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')

    is_detailed = True if instructor_summaries else False

    try:
        # ==========================================================
        # MODE 1: AGGREGATED SUMMARY CHARTS
        # ==========================================================
        if not is_detailed:
            total_hate = sum(item.get('hate', 0) for item in top_entities)
            total_safe = sum(item.get('safe', 0) for item in top_entities)
            bar_names = [item.get('name', 'Unknown') for item in top_entities[:10]]
            bar_hate_counts = [item.get('hate', 0) for item in top_entities[:10]]

            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
            
            if sum(bar_hate_counts) > 0:
                ax1.barh(bar_names, bar_hate_counts, color='#e74c3c')
                ax1.grid(color='gray', linestyle='--', linewidth=0.5, alpha=0.7)
                ax1.set_title(f'Top {len(top_entities)} by Hate Speech Volume', loc='center', fontfamily="Segoe UI", fontweight='bold', fontsize=16, pad=30)
                hate_patch = mpatches.Patch(color='#ef6c62', label='Hate Comments')
                ax1.legend(handles=[hate_patch], loc='upper center', bbox_to_anchor=(0.5, 1.12), frameon=False, fontsize=10)
                ax1.invert_yaxis()
            else:
                ax1.text(0.5, 0.5, "No Hate Speech Detected", ha='center', va='center')
                ax1.set_axis_off()

            pie_sizes = [total_hate, total_safe] if (total_hate > 0 or total_safe > 0) else [0.1, 0.1]
            total = sum(pie_sizes)
            ax2.pie(pie_sizes, colors=["#e74c3c", '#2ecc71'], autopct=lambda p: '{:.0f}'.format(p * total / 100), startangle=90, wedgeprops=dict(width=0.55))
            ax2.set_title('Safe vs. Hate Ratio', fontfamily="Segoe UI", fontweight='bold', fontsize=16)

            hate_patch = mpatches.Patch(color='#ef6c62', label='Hate Speech')
            safe_patch = mpatches.Patch(color='#4cd383', label='Safe Speech')
            ax2.legend(handles=[hate_patch, safe_patch], loc='upper center', bbox_to_anchor=(0.5, 0.05), ncol=2, frameon=False) 

            fig.tight_layout()
            temp_chart = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
            temp_chart.close() 
            fig.savefig(temp_chart.name, transparent=True, bbox_inches='tight')
            plt.close(fig) 
            
            temp_chart_path = temp_chart.name.replace('\\', '/')
            temp_files_to_cleanup.append(temp_chart_path)

        # ==========================================================
        # MODE 2: DETAILED FACULTY CHARTS
        # ==========================================================
        else:
            # 🎯 NEW: Generate a specific chart for EACH instructor
            if graph_data:
                for instructor, summary in instructor_summaries.items():
                    inst_graph = graph_data.get(instructor)
                    if not inst_graph:
                        continue
                        
                    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 3.5))
                    
                    # Bar Chart (Offending Students)
                    labels = inst_graph.get('labels', [])
                    hate_counts = inst_graph.get('hate_counts', [])
                    
                    if sum(hate_counts) > 0:
                        ax1.barh(labels, hate_counts, color='#e74c3c')
                        ax1.grid(color='gray', linestyle='--', linewidth=0.5, alpha=0.7)
                        ax1.set_title('Top Offending Students', fontfamily="Segoe UI", fontweight='bold', fontsize=14, pad=20)
                        ax1.invert_yaxis()
                    else:
                        ax1.text(0.5, 0.5, "No Student Offenders Logged", ha='center', va='center')
                        ax1.set_axis_off()

                    # Pie Chart (Safe vs Hate)
                    tot_hate = inst_graph.get('total_hate', 0)
                    tot_safe = inst_graph.get('total_safe', 0)
                    pie_sizes = [tot_hate, tot_safe] if (tot_hate > 0 or tot_safe > 0) else [0.1, 0.1]
                    total = sum(pie_sizes)
                    
                    ax2.pie(pie_sizes, colors=["#e74c3c", '#2ecc71'], autopct=lambda p: '{:.0f}'.format(p * total / 100), startangle=90, wedgeprops=dict(width=0.55))
                    ax2.set_title('Safe vs. Hate Ratio', fontfamily="Segoe UI", fontweight='bold', fontsize=14)

                    fig.tight_layout()
                    temp_chart = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                    temp_chart.close() 
                    fig.savefig(temp_chart.name, transparent=True, bbox_inches='tight')
                    plt.close(fig) 
                    
                    # Store the path directly inside the summary dictionary so the RML file can find it
                    inst_chart_path = temp_chart.name.replace('\\', '/')
                    summary['chart_path'] = inst_chart_path
                    temp_files_to_cleanup.append(inst_chart_path)

        context = {
            'top_entities': top_entities,
            'name_header': "Student Name" if entity_type == 'student' else "Professor Name",
            'chart_path': temp_chart_path,
            'logo_path': logo_file_path,
            'font_path': font_file_path,
            'generated_time': current_time,
            'is_detailed': is_detailed,
            'instructor_summaries': instructor_summaries
        }

        rml_string = render_to_string('xml/insight_report.rml', context)
        pdf_bytes = rml2pdf.parseString(rml_string.encode('utf-8'))
        return pdf_bytes

    except Exception as e:
        print(f"Error in PDF generation: {str(e)}")
        raise e 
        
    finally:
        # 🎯 Ensure ALL generated charts are deleted from the server immediately
        for file_path in temp_files_to_cleanup:
            if os.path.exists(file_path):
                os.remove(file_path)