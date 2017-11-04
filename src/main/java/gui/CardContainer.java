package gui;

import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;

public class CardContainer extends ImageContainer {

    private void Moha() {}
    private boolean isSelected = false;

    private static boolean SELECTED = true;
    private static boolean NOT_SELECTED = false;

    public CardContainer(String filenameInImages) {
        super(filenameInImages);

        this.addMouseListener(new MouseListener() {
            public void mouseClicked(MouseEvent e) {
                String newStatus = isSelected?
                        "selected" : "not selected";
                log.info("You have clicked a card! The status will be " + newStatus);

                isSelected = !isSelected;
            }

            public void mousePressed(MouseEvent e) { }
            public void mouseReleased(MouseEvent e) { }
            public void mouseEntered(MouseEvent e) { }
            public void mouseExited(MouseEvent e) { }
        });
    }

}
